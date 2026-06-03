import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  Netlify.env.get("SUPABASE_URL"),
  Netlify.env.get("SUPABASE_ANON_KEY")
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return error("Method not allowed", 405);
  }

  const user = await getSupabaseUser(req);
  if (!user) return error("Unauthorized", 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return error("Invalid JSON body", 400);
  }

  const { publicUrl } = body || {};

  if (!publicUrl) {
    return error("publicUrl required", 400);
  }

  // --- Insert into uploaded_notes using REAL column names ---
  const { data: inserted, error: insertErr } = await supabase
    .from("uploaded_notes")
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

  if (insertErr) {
    return error("Insert failed: " + insertErr.message, 500);
  }

  // --- Trigger OCR ---
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
