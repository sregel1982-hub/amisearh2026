import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";
import { latexToUnicode } from "./utils.js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401, "unauthorized");

  if (!isAiConfigured()) return aiUnavailableResponse();

  let body;
  try { body = await req.json(); } catch { body = {}; }

  const { message, history, notes, noteId } = body;

  if (!message || typeof message !== "string") {
    return jsonError("Message is required", 400, "missing_message");
  }

  // Jegyzetek betöltése + tisztítása
  let notesContext = "";

  if (notes && typeof notes === "string") {
    notesContext = latexToUnicode(notes.substring(0, 200000));
  }

  if (noteId && !notesContext) {
    const { data: noteRow } = await supabase
      .from("jegyzetek")
      .select("text_content, file_path")
      .eq("id", noteId)
      .single();

    if (noteRow?.text_content) {
      notesContext = latexToUnicode(noteRow.text_content.substring(0, 200000));
    }
  }

  if (!notesContext) {
    const { data: allNotes } = await supabase
      .from("jegyzetek")
      .select("text_content, file_path")
      .eq("user_id", user.id)
      .not("text_content", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);

    if (allNotes && allNotes.length > 0) {
      notesContext = allNotes
        .map((n, i) => {
          const clean = latexToUnicode(n.text_content || "");
          return `=== Jegyzet ${i + 1}: \( {n.file_path?.split("/").pop() || "ismeretlen"} ===\n \){clean}`;
        })
        .join("\n\n")
        .substring(0, 200000);
    }
  }

  const useGrounding = !notesContext;

  const contents = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      }
    }
  }

  let promptText = message;
  if (notesContext) {
    promptText = "=== FELTÖLTÖTT JEGYZETEK ===\n" + notesContext + "\n=== JEGYZETEK VÉGE ===\n\nFelhasználó kérdése: " + message;
  }

  contents.push({ role: "user", parts: [{ text: promptText }] });

  const baseInstruction = "Te egy kiváló magyar matematika tutor vagy az AMISEARCH platformon. Mindig tiszta, LaTeX-parancsok NÉLKÜLI magyar szöveget adj. Törteket írj így: 3 1/4 vagy 5/6. Szorzás: ×  Osztás: ÷. Válaszolj érthetően, lépésről lépésre.";

  const notesInstruction = notesContext 
    ? " Elsősorban a feltöltött jegyzetek alapján válaszolj." 
    : " Nincs feltöltött jegyzet, használj általános tudást.";

  try {
    const config = { systemInstruction: baseInstruction + notesInstruction };
    if (useGrounding) config.tools = [{ googleSearch: {} }];

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI failed:", error);
    return aiUnavailableResponse();
  }
}

export const config = {};
