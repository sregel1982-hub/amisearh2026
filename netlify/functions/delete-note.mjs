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
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env vars missing");
  }
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

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const noteId = body?.id || body?.noteId || body?.note_id;
  if (!noteId) return json({ error: "Missing note id" }, 400);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.error("[delete-note] init error:", e);
    return json({ error: "Server misconfiguration" }, 500);
  }

  try {
    // 1. Próbáljuk a jegyzetek táblát
    const { data: jegyzet, error: jErr } = await supabase
      .from("jegyzetek")
      .delete()
      .eq("id", noteId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();

    if (jErr) {
      console.error("[delete-note] jegyzetek error:", jErr);
    }

    if (jegyzet) {
      return json({ success: true, deletedFrom: "jegyzetek", id: noteId });
    }

    // 2. Ha nem volt ott, próbáljuk az uploaded_notes-t
    const { data: uploaded, error: uErr } = await supabase
      .from("uploaded_notes")
      .delete()
      .eq("id", noteId)
      .eq("uploader_identity_id", user.id)
      .select("id")
      .maybeSingle();

    if (uErr) {
      console.error("[delete-note] uploaded_notes error:", uErr);
    }

    if (uploaded) {
      return json({ success: true, deletedFrom: "uploaded_notes", id: noteId });
    }

    // 3. Sehol sem volt
    return json({ error: "A jegyzet nem található." }, 404);

  } catch (error) {
    console.error("[delete-note] failed:", error);
    return json({ error: "Törlési hiba", details: error?.message }, 500);
  }
}

export const config = {};
