import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

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

    // Egyszerű teszt válasz (hogy lássuk, elindul-e egyáltalán)
    const testResponse = "✅ A chat function működik! Most még teszt üzemmódban vagyok.";

    return new Response(testResponse, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (error) {
    console.error("Chat error:", error);
    return aiUnavailableResponse();
  }
}
