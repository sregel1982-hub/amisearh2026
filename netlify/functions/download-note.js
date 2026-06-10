import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { createSignedUrlFromRefs } from "./storage-helper.mjs";

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
  if (!url || !key) throw new Error("Supabase config missing");
  return createClient(url, key);
}

export default async function handler(req) {
  try {
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const url = new URL(req.url);
    const noteId = String(url.searchParams.get("id") || "").trim();
    const fallbackUserId = String(url.searchParams.get("userId") || "").trim();
    if (!noteId) return json({ error: "id kötelező" }, 400);

    let user = null;
    try { user = await getSupabaseUser(req); } catch (_) {}
    const userId = user?.id || fallbackUserId;
    if (!userId) return json({ error: "Bejelentkezés szükséges." }, 401);

    const supabase = getSupabaseAdmin();

    let { data: note, error: noteErr } = await supabase
      .from("jegyzetek")
      .select("id, file_path, public_url, original_name, user_id")
      .eq("id", noteId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!note && !noteErr) {
      const legacy = await supabase
        .from("uploaded_notes")
        .select("id, file_name, title, user_id")
        .eq("id", noteId)
        .eq("user_id", userId)
        .maybeSingle();
      if (legacy.data) {
        note = {
          id: legacy.data.id,
          file_path: `${userId}/${legacy.data.file_name}`,
          public_url: "",
          original_name: legacy.data.title || legacy.data.file_name,
          user_id: legacy.data.user_id
        };
      }
    }

    if (noteErr) return json({ error: noteErr.message }, 500);
    if (!note) return json({ error: "Note not found" }, 404);

    const signed = await createSignedUrlFromRefs(supabase, [note.file_path, note.public_url], 600);
    if (!signed.signedUrl) {
      return json({ error: "Nem sikerült letöltési linket generálni: " + (signed.error?.message || "a fájl nem található a storage-ban") }, 500);
    }

    return json({
      url: signed.signedUrl,
      originalName: note.original_name || "jegyzet",
      bucket: signed.bucket,
      path: signed.path
    });
  } catch (error) {
    console.error("download-note legacy-compatible error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}

export const config = {};
