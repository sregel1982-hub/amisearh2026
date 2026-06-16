import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FREE_MONTHLY_UPLOAD_LIMIT = 5;

function getEnv(key) {
  return (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];
}

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

function currentMonthPeriod() {
  return new Date().toISOString().slice(0, 7) + "-01";
}

function isActivePro(profile) {
  if (!profile) return false;
  if (String(profile.plan || "").toLowerCase() !== "pro") return false;
  if (!profile.plan_expires_at) return true;

  const expiresAt = new Date(profile.plan_expires_at);
  return Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() > Date.now();
}

function normalizeMonthlyCounter(profile) {
  const monthPeriod = currentMonthPeriod();
  if (!profile || profile.uploads_today_date !== monthPeriod) {
    return { monthPeriod, uploadsThisMonthCount: 0 };
  }

  return { monthPeriod, uploadsThisMonthCount: Number(profile.uploads_today_count || 0) };
}

function toCamelNote(row) {
  return {
    id: row.id,
    fileName: row.file_name,
    originalName: row.original_name,
    publicUrl: row.public_url,
    fileSize: row.file_size,
    uploaderIdentityId: row.uploader_identity_id,
    textContent: row.text_content,
    title: row.title,
    subject: row.subject,
    language: row.language,
    fileHash: row.file_hash,
    textHash: row.text_hash,
    plagiarismScore: row.plagiarism_score,
    similarNoteIds: row.similar_note_ids,
    createdAt: row.created_at,
  };
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
      full_name: user.user_metadata?.full_name || email || "User",
      username,
      email,
      status: "student",
      points: 0,
      plan: "free",
      uploads_today_count: 0,
      uploads_today_date: currentMonthPeriod(),
    })
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;
  return created;
}

async function ensureMonthlyCounterState(supabase, profile) {
  const { monthPeriod, uploadsThisMonthCount } = normalizeMonthlyCounter(profile);

  if (profile.uploads_today_date !== monthPeriod) {
    const { data, error } = await supabase
      .from("user_profiles")
      .update({ uploads_today_count: 0, uploads_today_date: monthPeriod })
      .eq("identity_id", profile.identity_id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    return data || { ...profile, uploads_today_count: 0, uploads_today_date: monthPeriod };
  }

  return { ...profile, uploads_today_count: uploadsThisMonthCount, uploads_today_date: monthPeriod };
}

async function incrementUploadCounter(supabase, profile) {
  if (isActivePro(profile)) return profile;

  const monthPeriod = currentMonthPeriod();
  const nextCount = Number(profile.uploads_today_count || 0) + 1;
  const { data, error } = await supabase
    .from("user_profiles")
    .update({ uploads_today_count: nextCount, uploads_today_date: monthPeriod })
    .eq("identity_id", profile.identity_id)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data || { ...profile, uploads_today_count: nextCount, uploads_today_date: monthPeriod };
}

async function handleGet(supabase) {
  const { data, error } = await supabase
    .from("uploaded_notes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) throw error;
  return json((data || []).map(toCamelNote));
}

async function handlePost(req, supabase, user) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const fileName = String(body.fileName || body.file_name || "").trim();
  const originalName = String(body.originalName || body.original_name || fileName || "").trim();
  const publicUrl = String(body.publicUrl || body.public_url || "").trim();
  const title = String(body.title || originalName || "").trim();
  const subject = String(body.subject || "").trim();
  const language = String(body.language || "hu").slice(0, 12);
  const fileHash = String(body.fileHash || body.file_hash || "").trim();
  const fileSize = Number(body.fileSize || body.file_size || 0) || 0;

  if (!fileName || !publicUrl || !title) {
    return json({ error: "Missing required note fields" }, 400);
  }

  let profile = await getOrCreateProfile(supabase, user);
  profile = await ensureMonthlyCounterState(supabase, profile);

  if (!isActivePro(profile) && Number(profile.uploads_today_count || 0) >= FREE_MONTHLY_UPLOAD_LIMIT) {
    return json({
      error: "Free monthly upload limit reached",
      code: "free_monthly_upload_limit_reached",
      limit: FREE_MONTHLY_UPLOAD_LIMIT,
    }, 402);
  }

  if (fileHash) {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("uploaded_notes")
      .select("id, title, original_name")
      .eq("uploader_identity_id", user.id)
      .eq("file_hash", fileHash)
      .maybeSingle();

    if (duplicateError) throw duplicateError;
    if (duplicate) {
      return json({
        error: "Duplicate file",
        message: "Ezt a fájlt már feltöltötted egyszer.",
        note: duplicate,
      }, 409);
    }
  }

  const payload = {
    file_name: fileName,
    original_name: originalName,
    public_url: publicUrl,
    file_size: fileSize,
    uploader_identity_id: user.id,
    title,
    subject,
    language,
    file_hash: fileHash || null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("uploaded_notes")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (insertError) throw insertError;

  const updatedProfile = await incrementUploadCounter(supabase, profile);

  return json({
    ...toCamelNote(inserted),
    profile: {
      plan: updatedProfile.plan || "free",
      planExpiresAt: updatedProfile.plan_expires_at || null,
      uploadsThisMonthCount: updatedProfile.uploads_today_count || 0,
      uploadsMonthPeriod: updatedProfile.uploads_today_date || null,
      uploadsTodayCount: updatedProfile.uploads_today_count || 0,
      uploadsTodayDate: updatedProfile.uploads_today_date || null,
    },
  }, 201);
}

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    console.error("[notes] Supabase admin init failed:", error?.message || error);
    return json({ error: "Server misconfiguration" }, 500);
  }

  try {
    if (req.method === "GET") return await handleGet(supabase);
    if (req.method === "POST") return await handlePost(req, supabase, user);
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("[notes] request failed:", error?.message || error);
    return json({ error: "Notes request failed" }, 500);
  }
}

export const config = {};
