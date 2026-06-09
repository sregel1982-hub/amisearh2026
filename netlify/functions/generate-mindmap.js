import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  try {
    console.log("✅ generate-mindmap.js fut.");

    if (req.method !== "POST") return jsonError("Method not allowed", 405);

    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const { topic } = body;

    if (!topic) return jsonError("Topic is required", 400);

    const prompt = `Készíts egy szép, színes gondolattérképet a következő témáról: "${topic}".
Használj Mermaid mindmap szintaxist.
Legyen vidám, strukturált és könnyen olvasható.
Minden szöveget tegyél dupla idézőjelbe.`;

    // Frissítve gemini-2.5-flash modellre
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { 
        systemInstruction: "Te egy Mermaid mindmap generátor vagy. Csak érvényes Mermaid kódot adj vissza, semmi mást." 
      }
    });

    let text = result.text ? result.text() : "";

    text = text.trim()
      .replace(/^```mermaid\n?/i, "")
      .replace(/```$/i, "")
      .trim();

    if (!text.startsWith("mindmap")) {
      text = "mindmap\n  root((\"" + topic + "\"))\n" + text;
    }

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Mindmap generation error:", error);
    return aiUnavailableResponse();
  }
}
