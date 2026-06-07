import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
);

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\\quad_?/g, " ")
    .replace(/\\_/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default async function handler(req) {
  if (req.method !== "POST")
    return jsonError("Method not allowed", 405, "method_not_allowed");

  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401, "unauthorized");
  if (!isAiConfigured()) return aiUnavailableResponse();

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { message, history, notes, noteId } = body;
  if (!message)
    return jsonError("Message is required", 400, "missing_message");

  let notesContext = "";
  if (notes) notesContext = cleanText(notes);

  if (noteId && !notesContext) {
    const { data: noteRow } = await supabase
      .from("jegyzetek")
      .select("text_content")
      .eq("id", noteId)
      .single();

    if (noteRow?.text_content)
      notesContext = cleanText(noteRow.text_content);
  }

  const contents = [];

  if (Array.isArray(history)) {
    history.slice(-8).forEach((msg) => {
      if (msg.role && msg.content) {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      }
    });
  }

  let promptText = message;

  if (notesContext) {
    promptText = `=== JEGYZET ===
${notesContext}
=== JEGYZET VÉGE ===

Kérdés: ${message}`;
  }

  const systemInstruction =
    "Te egy segítőkész magyar AI tutor vagy. Válaszolj magyarul, érthetően. Ne használj LaTeX parancsokat nyersen. Törteket írj 1 1/2 formában.";

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        ...contents,
        { role: "user", parts: [{ text: promptText }] }
      ],
      config: { systemInstruction }
    });

    return streamText(stream);
  } catch (error) {
    console.error(error);
    return aiUnavailableResponse();
  }
}

export const config = {};
