import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase környezeti változó hiányzik.");
  return createClient(url, key);
}

function mapNote(row) {
  return {
    id: row.id,
    title: row.cim || row.title || row.original_name || "Névtelen jegyzet",
    cim: row.cim || row.title || row.original_name || "Névtelen jegyzet",
    subject: row.tantargy || row.subject || "",
    originalName: row.original_name || row.originalName || row.file_path || "jegyzet",
    fileName: row.file_path || row.fileName || row.file_name || "",
    filePath: row.file_path || row.fileName || row.file_name || "",
    publicUrl: row.public_url || row.publicUrl || "",
    fileSize: row.file_size || row.fileSize || 0,
    language: row.nyelv || row.language || "hu",
    fileHash: row.file_hash || row.fileHash || "",
    textContent: row.text_content || row.textContent || "",
    uploaderIdentityId: row.user_id || row.uploaderIdentityId || "",
    createdAt: row.created_at || row.createdAt || null,
    processed: !!row.processed
  };
}

export default async function handler(req) {
  try {
    const user = await getSupabaseUser(req);
    if (!user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const supabase = getSupabaseAdmin();

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("jegyzetek")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) return json({ error: error.message }, 500);
      return json((data || []).map(mapNote));
    }

    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const filePath = body.fileName || body.filePath || body.file_name;
      const originalName = body.originalName || body.original_name || filePath || "jegyzet";
      const fileHash = body.fileHash || body.file_hash || null;

      if (!filePath) return json({ error: "Missing fileName" }, 400);

      if (fileHash) {
        const { data: duplicate } = await supabase
          .from("jegyzetek")
          .select("id, cim, original_name")
          .eq("user_id", user.id)
          .eq("file_hash", fileHash)
          .maybeSingle();
        if (duplicate) {
          return json({ message: "Ezt a fájlt már feltöltötted egyszer.", note: mapNote(duplicate) }, 409);
        }
      }

      const insertRow = {
        user_id: user.id,
        file_path: filePath,
        original_name: originalName,
        public_url: body.publicUrl || body.public_url || null,
        file_size: body.fileSize || body.file_size || null,
        file_hash: fileHash,
        cim: body.title || body.cim || originalName,
        tantargy: body.subject || body.tantargy || "",
        nyelv: body.language || body.nyelv || "hu",
        processed: false
      };

      const { data, error } = await supabase
        .from("jegyzetek")
        .insert(insertRow)
        .select("*")
        .single();

      if (error) return json({ error: error.message }, 500);
      return json(mapNote(data), 201);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error("notes.mjs error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}
