import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { createSignedUrlFromRefs } from "./storage-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
  if (req.method !== "GET") return jerr("Method not allowed", 405);

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Bejelentkezés szükséges.", 401);

  const url = new URL(req.url);
  const noteId = String(url.searchParams.get("id") || "").trim();
  if (!noteId) return jerr("id kötelező", 400);

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jerr("Supabase config missing", 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: note, error: noteErr } = await supabase
    .from("jegyzetek")
    .select("id, file_path, public_url, original_name, user_id")
    .eq("id", noteId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (noteErr) return jerr(noteErr.message, 500);
  if (!note) return jerr("Note not found", 404);

  const signed = await createSignedUrlFromRefs(supabase, [note.file_path, note.public_url], 600);
  if (!signed.signedUrl) {
    return jerr("Nem sikerült letöltési linket generálni: " + (signed.error?.message || "a fájl nem található a storage-ban"), 500);
  }

  return jok({
    url: signed.signedUrl,
    originalName: note.original_name || "jegyzet",
    bucket: signed.bucket,
    path: signed.path
  });
}

function jok(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function jerr(m, s = 400) {
  return new Response(JSON.stringify({ error: m }), {
    status: s,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export const config = {};
