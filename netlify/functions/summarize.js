import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { jsonError } from "./ai-response.js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY,
});

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  // --- User check ---
  const user = await getSupabaseUser(req);
  if (!user) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  // --- Parse body ---
  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  const { noteId, text, lang = "hu" } = body;

  if (!noteId && !text) {
    return jsonError("noteId or text is required", 400, "missing_input");
  }

  // --- Supabase init ---
  const supabase = await import("@supabase/supabase-js").then((m) =>
    m.createClient(
      Netlify.env.get("SUPABASE_URL"),
      Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")
    )
  );

  // --- Fetch note text if noteId provided ---
  let content = text;
  if (noteId) {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("content")
      .eq("id", noteId)
      .single();

    if (error || !data) {
      return jsonError("Note not found", 404, "note_not_found");
    }

    content = data.content;
  }

  // --- AI summarization ---
  try {
    const prompt = `
Készíts egy tömör, jól strukturált összefoglalót a következő jegyzetből.
Legyen:
- rövid
- lényegre törő
- pontokba szedett
- vizsgára alkalmas

Nyelv: ${lang}

Jegyzet szövege:
${content}
`;

    const result = await ai.models.generateText({
      model: "gemini-1.5-flash",
      prompt,
    });

    return new Response(
      JSON.stringify({
        summary: result.response.text(),
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    return jsonError(err.message, 500, "ai_error");
  }
}
