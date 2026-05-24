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
Commit changes → várj.

📋 Fájl 2: search.js
GitHub link: https://github.com/sregel1982-hub/amisearh2026/edit/main/netlify/functions/search.js

Töröld az egész tartalmat, és illeszd be ezt:

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

  const { query, notes, lang } = body;

  if (!query || typeof query !== "string") {
    return jsonError("Query is required", 400, "missing_query");
  }

  // Prompt összeállítása
  let prompt = query;
  if (notes) {
    prompt += "\n\nFeltöltött jegyzet kontextus:\n" + notes;
  }

  const isHungarian = lang !== "en";

  const systemInstruction = isHungarian
    ? "Te egy tudásalapú keresőmotor vagy az AMISEARCH tanulási platformon. " +
      "A weben keresel online szakkönyvekben, jegyzetekben, előadásokban és dolgozol a feltöltött jegyzetekből is. " +
      "Válaszolj tömören, informatívan, MAGYARUL. " +
      "Ha a felhasználó gondolattérképet kér, készíts egyet a Mermaid 'mindmap' szintaxissal. " +
      "FONTOS: 1) Első sor: 'mindmap'. 2) Gyökér: '  root((Tema))'. 3) Ágak: minden szint +2 szóköz. " +
      "4) Ne használj speciális karaktereket: { } [ ] | < >. 5) Max 3 szint mélység."
    : "You are a knowledge-based search engine on the AMISEARCH learning platform. " +
      "Search online textbooks, notes, lectures and work with uploaded notes too. " +
      "Answer concisely and informatively in ENGLISH. " +
      "If the user requests a mind map, create one using Mermaid 'mindmap' syntax. " +
      "IMPORTANT: 1) First line: 'mindmap'. 2) Root: '  root((Topic))'. 3) Branches: each level +2 spaces. " +
      "4) Don't use special characters: { } [ ] | < >. 5) Max 3 levels depth.";

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Search AI generation failed:", error);
    return aiUnavailableResponse();
  }
}

export const config = {};




  
