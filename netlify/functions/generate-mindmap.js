import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) => {
  const value = (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];
  if (!value) console.error(`Környezeti változó hiányzik: ${key}`);
  return value;
};

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  console.log("✅ generate-mindmap.js fut.");
  if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");

  if (!isAiConfigured()) {
    console.error("AI nincs konfigurálva generate-mindmap.js-ben.");
    return aiUnavailableResponse();
  }

  let body;
  try { body = await req.json(); } catch { return jsonError("Invalid JSON", 400, "invalid_json"); }

  const { topic, lang = "hu" } = body;

  const prompt = `Te egy oktatási segéd vagy. Készíts egy SZÍNES és VIDÁM gondolattérképet: ${topic}.
A kimenet Mermaid.js 'mindmap' legyen.
Minden ághoz rendelj egy egyedi színt vagy formát a Mermaid szintaxissal.
Minden szöveget tegyél dupla idézőjelbe.
Példa:
mindmap
  root(("${topic}"))
    (( "Ág 1" ))
      ::icon(fa fa-book)
    {{ "Ág 2" }}
    )) "Ág 3" ((`;

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { systemInstruction: "Te egy oktatási segéd vagy. Mermaid mindmap szintaxist generálsz." }
    });

    let fullText = "";
    for await (const chunk of stream.stream) {
      for (const candidate of chunk.candidates || []) {
        for (const part of candidate.content?.parts || []) {
          if (part.text) fullText += part.text;
        }
      }
    }

    let text = fullText.trim().replace(/^```mermaid\n?/, "").replace(/```$/, "").trim();
    if (!text.startsWith("mindmap")) text = "mindmap\n" + text;

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Mindmap generálás hiba generate-mindmap.js-ben:", error);
    return aiUnavailableResponse();
  }
}
