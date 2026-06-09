import { GoogleGenerativeAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { noteId, userId } = await req.json();

    if (!noteId || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing noteId or userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Get note content from database
    const { data: note, error: fetchError } = await supabase
      .from("uploaded_notes")
      .select("text_content, title, language")
      .eq("id", noteId)
      .eq("user_id", userId)
      .single();

    if (fetchError || !note) {
      return new Response(JSON.stringify({ error: "Note not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Generate summary using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Készíts egy rövid, érthető összefoglalót a következő szövegből. A szöveg nyelve: ${note.language || "hu"}.
    
Cím: ${note.title}

Szöveg:
${note.text_content}

Kérlek szórakoztatóan és világosan írj egy 2-3 bekezdéses összefoglalót, amely kiemeli a legfontosabb pontokat.`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    return new Response(JSON.stringify({ success: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Summarize note error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};