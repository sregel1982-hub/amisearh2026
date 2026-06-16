import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env vars missing: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY are required.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toCamelProfile(row) {
  if (!row) return null;

  return {
    id: row.id,
    identityId: row.identity_id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    status: row.status,
    points: row.points ?? 0,
    plan: row.plan || "free",
    planExpiresAt: row.plan_expires_at || null,
    lsSubscriptionId: row.ls_subscription_id || null,
    lsCustomerId: row.ls_customer_id || null,
    ratedBonusClaimed: row.rated_bonus_claimed ?? false,
    profileBonusClaimed: row.profile_bonus_claimed ?? false,
    uploadsThisMonthCount: row.uploads_today_count ?? 0,
    uploadsMonthPeriod: row.uploads_today_date || null,
    uploadsTodayCount: row.uploads_today_count ?? 0,
    uploadsTodayDate: row.uploads_today_date || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizePlan(row) {
  if (!row) return row;

  if (row.plan === "pro" && row.plan_expires_at) {
    const expiresAt = new Date(row.plan_expires_at);
    if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
      return { ...row, plan: "free" };
    }
  }

  return row;
}

async function getProfileByIdentityId(supabase, identityId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("identity_id", identityId)
    .maybeSingle();

  if (error) throw error;
  return normalizePlan(data);
}

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[user-profile] Supabase admin init failed:", error?.message || error);
    return json({ error: "Server misconfiguration" }, 500);
  }

  if (req.method === "GET") {
    try {
      const profile = await getProfileByIdentityId(supabase, user.id);
      return json({ profile: toCamelProfile(profile) });
    } catch (error) {
      console.error("[user-profile] GET failed:", error?.message || error);
      return json({ error: "Profile load failed" }, 500);
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const fullName = body.fullName || body.full_name || user.user_metadata?.full_name || user.email || "User";
    const username = body.username || user.email?.split("@")[0] || `user_${Date.now()}`;
    const status = body.status || "student";
    const email = body.email || user.email || "";

    try {
      const existing = await getProfileByIdentityId(supabase, user.id);

      if (existing) {
        const { data, error } = await supabase
          .from("user_profiles")
          .update({
            full_name: fullName,
            username,
            status,
            email,
          })
          .eq("identity_id", user.id)
          .select("*")
          .maybeSingle();

        if (error) throw error;
        return json({ profile: toCamelProfile(normalizePlan(data)) });
      }

      const { data, error } = await supabase
        .from("user_profiles")
        .insert({
          identity_id: user.id,
          full_name: fullName,
          username,
          email,
          status,
          points: 0,
          plan: "free",
        })
        .select("*")
        .maybeSingle();

      if (error) throw error;
      return json({ profile: toCamelProfile(data) }, 201);
    } catch (error) {
      console.error("[user-profile] POST failed:", error?.message || error);
      return json({ error: "Profile save failed" }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

export const config = {};
