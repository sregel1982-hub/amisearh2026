import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")),
});

export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405);

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json();
    const { message } = body;

    if (!message) return jsonError("Message required", 400);

    // Egyszerű AI hívás hibavédelemmel
    const stream = await ai.models.generateContentStream({
      model: "gemini-1.5-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: { 
        systemInstruction: "Te egy segítőkész magyar AI tutor vagy. Válaszolj magyarul." 
      }
    });

    // streamText import használata
    return streamText(stream);   // ha ez nincs, akkor lásd alul

  } catch (error) {
    console.error("Chat handler FULL ERROR:", error);
    return aiUnavailableResponse();
  }
}
