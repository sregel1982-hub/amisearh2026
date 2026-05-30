import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * /.netlify/functions/download-note?id=NOTE_ID
 *
 *  Bejelentkezett user → kap egy 5 perces signed URL-t a saját jegyzetéhez.
 *  Működik akkor is, ha a `jegyzetek` bucket PRIVATE.
 */
export default async function handler(req) {
  if (req.method !== "GET") return jerr("Method not allowed", 405);

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Bejelentkezés szükséges.", 401);

  const url = new URL(req.url);
  const noteId = Number(url.searchParams.get("id"));
  if (!noteId) return jerr("id kötelező", 400);

  /* Note lekérése */
  const [note] = await db
    .select()
    .from(uploadedNotes)
    .where(eq(uploadedNotes.id, noteId))
    .limit(1);

  if (!note) return jerr("Note not found", 404);

  /* (opcionális) tulajdonos check — most engedjük bárki letöltse */
  // if (note.uploaderIdentityId !== user.id) return jerr("Forbidden", 403);

  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_URL")) ||
    process.env.SUPABASE_URL;
  const serviceRoleKey =
    (typeof Netlify !== "undefined" &&
      (Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        Netlify.env.get("SERVICE_ROLE_KEY"))) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey)
    return jerr("Supabase config missing", 500);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  /* fileName a storage path-ban — pl. 1780123_kelet_es_nyugat.docx */
  const filePath = note.fileName;
  const { data, error } = await supabase.storage
    .from("jegyzetek")
    .createSignedUrl(filePath, 300); /* 5 perc */

  if (error || !data?.signedUrl) {
    console.error("[download-note] signed URL error:", error);
    return jerr("Nem sikerült letöltési linket generálni: " + (error?.message || "ismeretlen hiba"), 500);
  }

  return new Response(
    JSON.stringify({ url: data.signedUrl, originalName: note.originalName }),
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
