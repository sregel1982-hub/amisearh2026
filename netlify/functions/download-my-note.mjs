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
  return decodeURIComponent(storagePath);
}

export default async function handler(req) {
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const user = await getSupabaseUser(req);
    if (!user) return json({ error: "Bejelentkezés szükséges." }, 401);

    const url = new URL(req.url);
    const noteId = String(url.searchParams.get("id") || "").trim();
    if (!noteId) return json({ error: "id kötelező" }, 400);

    const supabase = getSupabaseAdmin();
    const { data: note, error: noteErr } = await supabase
      .from("jegyzetek")
      .select("id, file_path, public_url, original_name, user_id")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (noteErr) return json({ error: noteErr.message }, 500);
    if (!note) return json({ error: "A jegyzet nem található." }, 404);

    if (note.public_url) {
      return json({ url: note.public_url, originalName: note.original_name || "jegyzet" });
    }

    const storagePath = normalizeStoragePath(note.file_path);
    if (!storagePath) return json({ error: "Hiányzó fájlútvonal." }, 400);

    const { data, error } = await supabase.storage
      .from("jegyzetek")
      .createSignedUrl(storagePath, 300);

    if (error || !data?.signedUrl) {
      return json({ error: "Nem sikerült letöltési linket generálni: " + (error?.message || "ismeretlen hiba") }, 500);
    }

    return json({ url: data.signedUrl, originalName: note.original_name || "jegyzet" });
  } catch (error) {
    console.error("download-my-note error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}

export const config = {};
