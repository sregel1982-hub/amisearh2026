import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) return errorRes("Unauthorized", 401);

  // GET – Saját jegyzetek listázása
  if (req.method === "GET") {
    const { data, error: fetchErr } = await supabase
      .from("jegyzetek")
      .select("id, file_path, text_content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (fetchErr) return errorRes("Fetch failed: " + fetchErr.message, 500);
    return ok(data);
  }

  // POST – Jegyzet feltöltése
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return errorRes("Invalid JSON body", 400);
    }

    const { publicUrl, filePath } = body || {};
    if (!publicUrl) return errorRes("publicUrl required", 400);

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

    if (insertErr) return errorRes("Insert failed: " + insertErr.message, 500);

    // index-document trigger (aszinkron, nem blokkoló)
    if (filePath) {
      fetch("https://amisearch.org/.netlify/functions/index-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: inserted.id, filePath })
      }).catch(e => console.error("index-document trigger failed:", e.message));
    }

    return ok(inserted);
  }

  return errorRes("Method not allowed", 405);
}

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function errorRes(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
