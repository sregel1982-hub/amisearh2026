import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FREE_MONTHLY_UPLOAD_LIMIT = 5;

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

function toCamelNote(row = {}) {
  const title = row.cim || row.title || row.original_name || row.file_name || row.file_path || "Névtelen jegyzet";
  const fileName = row.file_path || row.file_name || row.original_name || title;
  return {
    id: row.id,
    fileName,
    filePath: row.file_path || row.file_name || fileName,
    originalName: row.original_name || title,
    publicUrl: row.public_url || "",
    fileSize: row.file_size || 0,
    uploaderIdentityId: row.user_id || row.uploader_identity_id || null,
    userId: row.user_id || row.uploader_identity_id || null,
    textContent: row.text_content || "",
    title,
    cim: row.cim || row.title || title,
    subject: row.tantargy || row.subject || "",
    tantargy: row.tantargy || row.subject || "",
    language: row.nyelv || row.language || "hu",
    nyelv: row.nyelv || row.language || "hu",
    processed: Boolean(row.processed || row.text_content),
    createdAt: row.created_at || null,
    created_at: row.created_at || null,
  };
}

function isSchemaProblem(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("relation") || message.includes("does not exist") || message.includes("column") || message.includes("schema cache");
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

async function selectRowsIgnoringMissing(supabase, table, queryBuilder) {
  const result = await queryBuilder(supabase.from(table));
  if (result.error) {
    if (isSchemaProblem(result.error)) return [];
    throw result.error;
  }
  return result.data || [];
}

async function handleGet(supabase, user) {
  const jegyzetek = await selectRowsIgnoringMissing(supabase, "jegyzetek", (from) => from
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300));

  const uploadedNotes = await selectRowsIgnoringMissing(supabase, "uploaded_notes", (from) => from
    .select("*")
    .eq("uploader_identity_id", user.id)
    .order("created_at", { ascending: false })
    .limit(300));

  return json([...jegyzetek, ...uploadedNotes].map(toCamelNote));
}

async function findDuplicate(supabase, user, fileName) {
  const checks = [
    supabase.from("jegyzetek").select("*").eq("user_id", user.id).eq("file_path", fileName).maybeSingle(),
    supabase.from("uploaded_notes").select("*").eq("uploader_identity_id", user.id).eq("file_name", fileName).maybeSingle(),
  ];

  for (const check of checks) {
    const { data, error } = await check;
    if (error) {
      if (isSchemaProblem(error)) continue;
      throw error;
    }
    if (data) return data;
  }
  return null;
}

async function insertIntoJegyzetek(supabase, payload) {
  const fullPayload = {
    user_id: payload.userId,
    cim: payload.title,
    tantargy: payload.subject,
    nyelv: payload.language,
    original_name: payload.originalName,
    file_path: payload.fileName,
    public_url: payload.publicUrl || null,
    text_content: payload.textContent || null,
    processed: Boolean(payload.textContent),
  };

  let result = await supabase.from("jegyzetek").insert(fullPayload).select("*").maybeSingle();
  if (!result.error) return result.data;
  if (!isSchemaProblem(result.error)) throw result.error;

  const minimalPayload = {
    user_id: payload.userId,
    cim: payload.title,
    tantargy: payload.subject,
    file_path: payload.fileName,
  };
  result = await supabase.from("jegyzetek").insert(minimalPayload).select("*").maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function insertIntoUploadedNotes(supabase, payload) {
  const fullPayload = {
    file_name: payload.fileName,
    original_name: payload.originalName,
    public_url: payload.publicUrl || null,
    file_size: Number(payload.fileSize || 0),
    uploader_identity_id: payload.userId,
    text_content: payload.textContent || null,
    title: payload.title,
    subject: payload.subject,
    language: payload.language,
  };

  let result = await supabase.from("uploaded_notes").insert(fullPayload).select("*").maybeSingle();
  if (!result.error) return result.data;
  if (!isSchemaProblem(result.error)) throw result.error;

  const minimalPayload = {
    file_name: payload.fileName,
    original_name: payload.originalName,
    uploader_identity_id: payload.userId,
    title: payload.title,
    subject: payload.subject,
    language: payload.language,
  };
  result = await supabase.from("uploaded_notes").insert(minimalPayload).select("*").maybeSingle();
  if (result.error) throw result.error;
  return result.data;
}

async function insertNote(supabase, payload) {
  try {
    return await insertIntoJegyzetek(supabase, payload);
  } catch (firstError) {
    if (!isSchemaProblem(firstError)) throw firstError;
    return await insertIntoUploadedNotes(supabase, payload);
  }
}

async function handlePost(req, supabase, user) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const fileName = String(body.fileName || body.filePath || body.file_name || body.file_path || "").trim();
  const originalName = String(body.originalName || body.original_name || fileName || "").trim();
  const publicUrl = String(body.publicUrl || body.public_url || "").trim();
  const textContent = String(body.textContent || body.text_content || "").trim();
  const title = String(body.title || body.cim || originalName || fileName || "").trim();
  const subject = String(body.subject || body.tantargy || "").trim();
  const language = String(body.language || body.nyelv || "hu").slice(0, 12);
  const fileSize = Number(body.fileSize || body.file_size || 0);

  if (!fileName || !title) return json({ error: "Missing required note fields" }, 400);

  let profile = await getOrCreateProfile(supabase, user);
  profile = await ensureMonthlyCounterState(supabase, profile);

  if (!isActivePro(profile) && Number(profile.uploads_today_count || 0) >= FREE_MONTHLY_UPLOAD_LIMIT) {
    return json({
      error: "Free monthly upload limit reached",
      code: "free_monthly_upload_limit_reached",
      limit: FREE_MONTHLY_UPLOAD_LIMIT,
    }, 402);
  }

  const duplicate = await findDuplicate(supabase, user, fileName);
  if (duplicate) {
    return json({
      error: "Duplicate file",
      message: "Ezt a fájlt már feltöltötted egyszer.",
      note: toCamelNote(duplicate),
    }, 409);
  }

  const inserted = await insertNote(supabase, {
    userId: user.id,
    fileName,
    originalName,
    publicUrl,
    textContent,
    title,
    subject,
    language,
    fileSize,
  });

  const updatedProfile = await incrementUploadCounter(supabase, profile);
  const note = toCamelNote(inserted || { file_name: fileName, original_name: originalName, title, subject, language, text_content: textContent });

  return json({
    ...note,
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
    if (req.method === "GET") return await handleGet(supabase, user);
    if (req.method === "POST") return await handlePost(req, supabase, user);
    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("[notes] request failed:", error?.message || error, error);
    return json({ error: "Notes request failed", details: error?.message || String(error) }, 500);
  }
}

export const config = {};
