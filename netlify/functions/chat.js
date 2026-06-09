import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")),
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
);

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405, "method_not_allowed");
    }

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("Unauthorized", 401, "unauthorized");

    if (!isAiConfigured()) return aiUnavailableResponse();

    let body;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const { message, history = [], notes, noteId } = body;

    if (!message) return jsonError("Message is required", 400, "missing_message");

    // ... (a mindmap és notesContext rész maradhat ugyanaz)

    // === A generateContentStream rész hibavédelemmel ===
    const contents = []; // history feldolgozás...

    let promptText = message;
    if (notesContext) {
      promptText = `=== JEGYZET ===\n${notesContext}\n=== JEGYZET VÉGE ===\nKérdés: ${message}`;
    }

    const systemInstruction = "Te egy segítőkész magyar AI tutor vagy...";

    const stream = await ai.models.generateContentStream({
      model: "gemini-1.5-flash",           // ← ideiglenesen stabilabb modell
      contents: [
        ...contents,
        { role: "user", parts: [{ text: promptText }] }
      ],
      config: { systemInstruction }
    });

    return streamText(stream);

  } catch (error) {
    console.error("Chat handler error:", error);
    return aiUnavailableResponse();   // vagy jsonError
  }
}
