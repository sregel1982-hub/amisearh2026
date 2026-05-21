import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const ai = new GoogleGenAI({});

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

  // Chat history (max 10)
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

  // Prompt összeállítása
  let promptText = message;
  if (notes) {
    promptText += "\n\nFeltöltött jegyzet:\n" + notes;
  }

  contents.push({
    role: "user",
    parts: [{ text: promptText }]
  });

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        systemInstruction:
          "Te egy segítőkész AI tutor vagy az AMISEARCH tanulási platformon. " +
          "Használd a weben fellelhető online szakkönyveket, előadásokat és a feltöltött jegyzeteket. " +
          "Segíts a diákoknak megérteni a tananyagot, válaszolj világosan. " +
          "Ha a felhasználó gondolattérképet kér, mindig készíts egyet a Mermaid.js 'mindmap' szintaxisával. " +
          "FONTOS SZABÁLYOK a mindmap szintaxishoz: " +
          "1) Az első sor legyen pontosan 'mindmap'. " +
          "2) A második sor legyen a gyökér elem pontosan 2 szóközzel behúzva: '  root((Téma neve))'. " +
          "3) Minden további ág pontosan 2 szóközzel mélyebben legyen az előzőnél. " +
          "4) NE használj speciális karaktereket: { } [ ] | < >. " +
          "5) Kerüld az ékezeteket az ágak nevében ha lehet. " +
          "6) Maximum 3 szint mélységet használj.",
        tools: [{ googleSearch: {} }]
      }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI generation failed:", error);
    return aiUnavailableResponse();
  }
}

export const config = {};
