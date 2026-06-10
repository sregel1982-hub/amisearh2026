import { GoogleGenAI } from "@google/genai";
import { extractText, jsonError } from "./ai-response.js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({
  apiKey: getEnv("GEMINI_API_KEY"),
});

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401, "unauthorized");

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  const { noteId, lang = "hu" } = body;
  if (!noteId) return jsonError("noteId required", 400, "missing_noteId");

  const supabase = await import("@supabase/supabase-js").then((m) =>
    m.createClient(
      getEnv("SUPABASE_URL"),
      getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
    )
  );

  // JAVÍTÁS: "jegyzetek" tábla az "uploaded_notes" helyett
  const { data, error } = await supabase
    .from("jegyzetek")
    .select("text_content, cim, original_name")
    .eq("id", noteId)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return jsonError("Note not found", 404, "note_not_found");

  const content = data.text_content || "";
  const title = data.cim || data.original_name || "Jegyzet";

  if (!content.trim()) {
    return jsonError("A jegyzetnek nincs kinyert szövege. Először feldolgozás szükséges.", 400, "empty_content");
  }

  try {
    const prompt = `
Készíts egy tömör, jól strukturált összefoglalót a következő jegyzetből.
Cím: ${title}

Legyen:
- rövid
- lényegre törő
- pontokba szedett
- vizsgára alkalmas

Nyelv: ${lang === 'hu' ? 'magyar' : 'angol'}

Jegyzet szövege:
${content.substring(0, 15000)}
`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return new Response(
      JSON.stringify({
        summary: extractText(result),
        title: title,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (err) {
    console.error("Summarize error:", err);
    return jsonError(err.message, 500, "ai_error");
  }
}

export const config = {};
