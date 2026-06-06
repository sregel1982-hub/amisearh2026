  import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

function mapRow(row) {
  return {
    id: row.id,
    title: row.cim || row.original_name || "Névtelen jegyzet",
    cim: row.cim,
    subject: row.subject || null,
    language: row.language || null,
    file_name: row.file_path,
    fileName: row.file_path,
    original_name: row.original_name,
    originalName: row.original_name,
    public_url: row.public_url,
    file_size: row.file_size || 0,
    uploaderIdentityId: row.user_id,
    textContent: row.text_content || null,
    created_at: row.created_at
  };
}

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) return errorRes("Unauthorized", 401);

  if (req.method === "GET") {
    const { data, error: fetchErr } = await supabase
      .from("jegyzetek")
      .select("id, cim, subject, language, file_path, original_name, public_url, file_size, text_content, user_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchErr) return errorRes("Fetch failed: " + fetchErr.message, 500);
    return ok((data || []).map(mapRow));
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return errorRes("Invalid JSON body", 400); }

    const { publicUrl, fileName, originalName, fileSize, cim, title, subject, language } = body || {};
    const storagePath = fileName || body.filePath;

    if (!publicUrl) return errorRes("publicUrl required", 400);
    if (!storagePath) return errorRes("fileName required", 400);

    const { data: inserted, error: insertErr } = await supabase
      .from("jegyzetek")
      .insert({
        user_id: user.id,
        cim: cim || title || originalName || "Névtelen jegyzet",
        original_name: originalName || storagePath,
        file_path: storagePath,
        public_url: publicUrl,
        file_size: fileSize || 0,
        subject: subject || null,
        language: language || null,
        text_content: null,
        text_hash: null,
        embedding: null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) return errorRes("Insert failed: " + insertErr.message, 500);
    return ok(mapRow(inserted));
  }

  return errorRes("Method not allowed", 405);
}

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function errorRes(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
