import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  if (!isAiConfigured()) {
    return aiUnavailableResponse();
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { message, history, notes } = body;

  if (!message || typeof message !== "string") {
    return jsonError("Message is required", 400, "missing_message");
  }

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

  // Limit notes context (Gemini handles up to 1M tokens, but be sensible)
  const notesContext = (notes && typeof notes === "string") 
    ? notes.substring(0, 200000)
    : "";

  let promptText = message;
  if (notesContext) {
    promptText = 
      "=== FELTÖLTÖTT JEGYZET ===\n" +
      notesContext +
      "\n=== JEGYZET VÉGE ===\n\n" +
      "Felhasználó kérdése: " + message;
  }

  contents.push({
    role: "user",
    parts: [{ text: promptText }]
  });

  const baseInstruction = 
    "Te egy segítőkész AI tutor vagy az AMISEARCH tanulási platformon, egyetemistáknak segítesz tanulni. " +
    "Válaszolj MAGYARUL, érthető magyarázatokkal. " +
    "Használhatsz LaTeX formulákat a $...$ vagy $$...$$ szintaxissal. " +
    "Listák, fejezetek és táblázatok markdown-nal. " +
    "Ha a felhasználó gondolattérképet kér, készíts egyet a Mermaid 'mindmap' szintaxissal " +
    "(első sor 'mindmap', gyökér root((Téma)), ágak 2 szóköz indent, MAX 3 szint).";

  const notesInstruction = notesContext
    ? " A felhasználó FELTÖLTÖTT EGY JEGYZETET (lásd '=== FELTÖLTÖTT JEGYZET ===' szekciót a kérdés előtt). " +
      "ELSŐSORBAN ebből a jegyzetből válaszolj. Idézz vagy hivatkozz konkrét részekre. " +
      "Ha a kérdésre a jegyzetben nincs válasz, akkor ezt JELEZD, és csak utána egészítsd ki általános tudásoddal."
    : "";

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: baseInstruction + notesInstruction
      }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI generation failed:", error);
    return aiUnavailableResponse();
  }
}

export const config = {};
