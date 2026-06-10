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

function normalizeStoragePath(filePath = "") {
  let storagePath = String(filePath || "").trim();
  if (!storagePath) return "";
  const marker = "/jegyzetek/";
  if (storagePath.includes(marker)) storagePath = storagePath.split(marker).pop();
  const storageObjectMarker = "/storage/v1/object/public/jegyzetek/";
  if (storagePath.includes(storageObjectMarker)) storagePath = storagePath.split(storageObjectMarker).pop();
  if (/^https?:\/\//i.test(storagePath)) return "";
  return decodeURIComponent(storagePath);
}

export default async function handler(req) {
  try {
    if (req.method !== "DELETE" && req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const user = await getSupabaseUser(req);
    if (!user) return json({ error: "Bejelentkezés szükséges." }, 401);

    const url = new URL(req.url);
    let noteId = String(url.searchParams.get("id") || "").trim();
    if (!noteId && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      noteId = String(body.id || body.noteId || "").trim();
    }
    if (!noteId) return json({ error: "id kötelező" }, 400);

    const supabase = getSupabaseAdmin();
    const { data: note, error: noteErr } = await supabase
      .from("jegyzetek")
      .select("id, file_path, user_id")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (noteErr) return json({ error: noteErr.message }, 500);
    if (!note) return json({ error: "A jegyzet nem található." }, 404);

    const storagePath = normalizeStoragePath(note.file_path);
    let storageWarning = null;
    if (storagePath) {
      const { error: storageError } = await supabase.storage.from("jegyzetek").remove([storagePath]);
      if (storageError) storageWarning = storageError.message;
    }

    const { error: deleteError } = await supabase
      .from("jegyzetek")
      .delete()
      .eq("id", noteId)
      .eq("user_id", user.id);

    if (deleteError) return json({ error: deleteError.message }, 500);

    return json({ success: true, deletedId: noteId, storageWarning });
  } catch (error) {
    console.error("delete-note error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}

export const config = {};
