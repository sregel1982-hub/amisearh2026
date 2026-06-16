import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const JSON_HEADERS = { "Content-Type": "application/json" };

const REWARDS = {
  five_star_rating: { amount: 50, oneTime: true, flagColumn: "rated_bonus_claimed" },
  document_upload: { amount: 20, oneTime: false },
  profile_complete: { amount: 30, oneTime: true, flagColumn: "profile_bonus_claimed" },
};

function getEnv(key) {
  return (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env vars missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY are required.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function profileNameFromUser(user) {
  const email = user.email || "";
  return user.user_metadata?.full_name || email || "User";
}

async function getOrCreateProfile(supabase, user) {
  const { data: existing, error: selectError } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("identity_id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing) return existing;

  const email = user.email || "";
  const username = email ? email.split("@")[0] : `user_${Date.now()}`;
  const { data: created, error: insertError } = await supabase
    .from("user_profiles")
    .insert({
      identity_id: user.id,
      full_name: profileNameFromUser(user),
      username,
      email,
      status: "student",
      points: 0,
      plan: "free",
    })
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;
  return created;
}

async function updateProfileWithFallback(supabase, userId, updates) {
  const runUpdate = async (payload) => supabase
    .from("user_profiles")
    .update(payload)
    .eq("identity_id", userId)
    .select("*")
    .maybeSingle();

  let result = await runUpdate(updates);
  if (!result.error) return result.data;

  const message = String(result.error.message || "").toLowerCase();
  const flagProblem = message.includes("rated_bonus_claimed") || message.includes("profile_bonus_claimed") || message.includes("column");
  if (!flagProblem) throw result.error;

  const fallbackUpdates = { ...updates };
  delete fallbackUpdates.rated_bonus_claimed;
  delete fallbackUpdates.profile_bonus_claimed;
  result = await runUpdate(fallbackUpdates);
  if (result.error) throw result.error;
  return result.data;
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await getSupabaseUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const reason = body?.reason;
  const rule = REWARDS[reason];
  if (!rule) return json({ error: `Unknown reason: ${reason}` }, 400);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[award-points] Supabase admin init failed:", error?.message || error);
    return json({ error: "Server misconfiguration" }, 500);
  }

  try {
    const profile = await getOrCreateProfile(supabase, user);
    const currentPoints = Number(profile.points || 0);
    const currentPlan = String(profile.plan || "free").toLowerCase();

    if (rule.oneTime && rule.flagColumn && profile[rule.flagColumn]) {
      return json({
        points: currentPoints,
        awarded: 0,
        plan: profile.plan || "free",
        planExpiresAt: profile.plan_expires_at || null,
        reason,
        message: "Already claimed",
      });
    }

    const awarded = rule.amount;
    let nextPoints = currentPoints + awarded;
    const updates = { points: nextPoints };

    if (rule.oneTime && rule.flagColumn) updates[rule.flagColumn] = true;

    let upgraded = false;
    if (currentPlan === "free" && nextPoints >= 500) {
      updates.plan = "pro";
      updates.points = 0;
      nextPoints = 0;
      upgraded = true;
    }

    const updated = await updateProfileWithFallback(supabase, user.id, updates);

    return json({
      points: Number(updated?.points ?? nextPoints),
      awarded,
      plan: updated?.plan || updates.plan || profile.plan || "free",
      planExpiresAt: updated?.plan_expires_at || profile.plan_expires_at || null,
      upgraded,
      reason,
    });
  } catch (error) {
    console.error("[award-points] request failed:", error?.message || error, error);
    return json({ error: "Award points request failed", details: error?.message || String(error) }, 500);
  }
}

export const config = {};
