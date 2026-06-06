import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
  if (req.method !== "GET") return jerr("Method not allowed", 405);

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Bejelentkezés szükséges.", 401);

  const url = new URL(req.url);
  const noteId = Number(url.searchParams.get("id"));
  if (!noteId) return jerr("id kötelező", 400);

  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) return jerr("Supabase config missing", 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: note, error: noteErr } = await supabase
    .from("jegyzetek")
    .select("id, file_path, original_name, user_id")
    .eq("id", noteId)
    .single();

  if (noteErr || !note) return jerr("Note not found", 404);

  const filePath = note.file_path;
  const { data, error } = await supabase.storage
    .from("jegyzetek")
    .createSignedUrl(filePath, 300);

  if (error || !data?.signedUrl) {
    console.error("[download-note] signed URL error:", error);
    return jerr("Nem sikerült letöltési linket generálni: " + (error?.message || "ismeretlen hiba"), 500);
  }

  return new Response(
    JSON.stringify({ url: data.signedUrl, originalName: note.original_name }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function jerr(m, s = 400) {
  return new Response(JSON.stringify({ error: m }), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
