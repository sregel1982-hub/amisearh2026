import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL"),
  Netlify.env.get("SUPABASE_ANON_KEY")
);

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) return error("Unauthorized", 401);

  // ---------------------------
  // 1) GET – Saját jegyzetek listázása
  // ---------------------------
  if (req.method === "GET") {
    const { data, error: fetchErr } = await supabase
      .from("jegyzetek")
      .select("id, file_path, text_content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchErr) return error("Fetch failed: " + fetchErr.message, 500);
    return ok(data);
  }

  // ---------------------------
  // 2) POST – Jegyzet feltöltése
  // ---------------------------
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return error("Invalid JSON body", 400);
    }

    const { publicUrl } = body || {};
    if (!publicUrl) return error("publicUrl required", 400);

    // Insert
    const { data: inserted, error: insertErr } = await supabase
      .from("jegyzetek")
      .insert({
        user_id: user.id,
        file_path: publicUrl,
        text_content: null,
        text_hash: null,
        embedding: null,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertErr) return error("Insert failed: " + insertErr.message, 500);

    // OCR trigger
    try {
      await fetch("https://amisearch.org/.netlify/functions/OCR", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId: inserted.id,
          fileUrl: publicUrl
        })
      });
    } catch (e) {
      console.error("OCR trigger failed:", e.message);
    }

    return ok(inserted);
  }

  return error("Method not allowed", 405);
}

// ---------------------------
// Helper functions
// ---------------------------
function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function error(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
