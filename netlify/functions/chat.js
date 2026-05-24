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
      model: "gemini-2.5-flash",
      contents,
      config: {
        systemInstruction: "Te egy segítőkész AI tutor vagy az AMISEARCH tanulási platformon. Segíts a diákoknak megérteni a tananyagot."
      }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI generation failed:", error);
    return aiUnavailableResponse();
  }
}

export const config = {};
