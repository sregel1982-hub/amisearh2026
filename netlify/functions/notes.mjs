import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

// Supabase kliens (anon kulcs a feltöltéshez)
const supabase = createClient(
  Netlify.env.get("SUPABASE_URL"),
  Netlify.env.get("SUPABASE_ANON_KEY")
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  // --- User ellenőrzés ---
  const user = await getSupabaseUser(req);
  if (!user) return error("Unauthorized", 401);

  // --- JSON body ---
  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { fileName, publicUrl, fileSize } = body || {};

  if (!fileName || !publicUrl) {
    return error("fileName és publicUrl kötelező", 400);
  }

  // --- Jegyzet beszúrása ---
  const { data: inserted, error: insertErr } = await supabase
    .from("uploaded_notes")
    .insert({
      user_id: user.id,
      file_path: publicUrl,     // ← EZ A HELYES MEZŐ
      text_content: null,       // OCR fogja kitölteni
      text_hash: null,
      embedding: null,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (insertErr) {
    return error("Insert failed: " + insertErr.message, 500);
  }

  // --- OCR trigger ---
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
    console.error("[notes] OCR trigger failed:", e.message);
  }

  return ok(inserted);
}

// --- Helper válaszok ---
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
