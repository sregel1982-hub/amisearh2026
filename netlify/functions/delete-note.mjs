import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const JSON_HEADERS = { "Content-Type": "application/json" };

function getEnv(key) {
  return (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function getSupabaseAdmin() {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase env");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default async function handler(req) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  const user = await getSupabaseUser(req);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body = {};
  try { body = await req.json(); } catch {}

  const noteId = body.id || body.noteId || body.note_id || null;
  const title  = body.title || body.cim || body.fileName || null;

  if (!noteId && !title) {
    return json({ error: "Missing note id or title" }, 400);
  }

  const supabase = getSupabaseAdmin();

  try {
    // ---------- 1. jegyzetek tábla (id alapján) ----------
    if (noteId) {
      const { data, error } = await supabase
        .from("jegyzetek")
        .delete()
        .eq("id", noteId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();

      if (!error && data) {
        return json({ success: true, deletedFrom: "jegyzetek", id: noteId });
      }
    }

    // ---------- 2. uploaded_notes tábla (id alapján) ----------
    if (noteId) {
      const { data, error } = await supabase
        .from("uploaded_notes")
        .delete()
        .eq("id", noteId)
        .or(`uploader_identity_id.eq.${user.id},user_id.eq.${user.id}`)
        .select("id")
        .maybeSingle();

      if (!error && data) {
        return json({ success: true, deletedFrom: "uploaded_notes", id: noteId });
      }
    }

    // ---------- 3. utolsó esély: cím alapján (csak diagnosztikára) ----------
    if (title) {
      const { data: j } = await supabase
        .from("jegyzetek")
        .delete()
        .eq("user_id", user.id)
        .ilike("cim", title)
        .select("id");

      if (j && j.length) {
        return json({ success: true, deletedFrom: "jegyzetek (by title)", count: j.length });
      }

      const { data: u } = await supabase
        .from("uploaded_notes")
        .delete()
        .or(`uploader_identity_id.eq.${user.id},user_id.eq.${user.id}`)
        .ilike("title", title)
        .select("id");

      if (u && u.length) {
        return json({ success: true, deletedFrom: "uploaded_notes (by title)", count: u.length });
      }
    }

    // ---------- Semhol sincs ----------
    return json({
      error: "A jegyzet nem található.",
      debug: {
        sentId: noteId,
        sentTitle: title,
        userId: user.id
      }
    }, 404);

  } catch (err) {
    console.error("[delete-note]", err);
    return json({ error: "Törlési hiba", details: err.message }, 500);
  }
}

export const config = {};
