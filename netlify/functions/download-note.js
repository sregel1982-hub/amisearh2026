import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const noteId = url.searchParams.get("id");
    const userId = url.searchParams.get("userId");

    if (!noteId || !userId) {
      return new Response(JSON.stringify({ error: "Missing id or userId" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Get note from database
    const { data: note, error: fetchError } = await supabase
      .from("uploaded_notes")
      .select("*")
      .eq("id", noteId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !note) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Create signed URL for download
    const { data: signedData, error: signError } = await supabase.storage
      .from("uploaded-notes")
      .createSignedUrl(`${userId}/${note.file_name}`, 3600);

    if (signError) {
      return new Response(JSON.stringify({ error: "Failed to create signed URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: signedData.signedUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Download note error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};