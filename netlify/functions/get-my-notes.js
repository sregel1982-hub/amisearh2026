import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get all notes for this user
    const { data: notes, error } = await supabase
      .from("uploaded_notes")
      .select("id, title, subject, language, created_at, file_name")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch notes", details: error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, notes: notes || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Get my notes error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};