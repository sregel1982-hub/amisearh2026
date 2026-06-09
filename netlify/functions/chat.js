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

    const body = await req.json().catch(() => ({}));
    const { message } = body;

    if (!message) return jsonError("Message required", 400);

    // Frissítve gemini-2.5-flash modellre
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: "Te egy segítőkész magyar AI tutor vagy. Válaszolj barátságosan, érthetően és magyarul."
      }
    });

    const responseText = result.text ? result.text() : "Nem kaptam választ.";

    return new Response(responseText, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (error) {
    console.error("CHAT CRITICAL ERROR:", error?.message || error);
    return aiUnavailableResponse();
  }
}
