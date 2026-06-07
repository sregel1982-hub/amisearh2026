import { GoogleGenerativeAI } from "@google/generative-ai";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  const { topic, lang = "hu" } = body;
  if (!topic) return new Response("Missing topic", { status: 400 });

  const genAI = new GoogleGenerativeAI(getEnv("GEMINI_API_KEY"));
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
Te egy oktatási segéd vagy. Készíts egy színes, látványos gondolattérképet: ${topic}.
A kimenet KIZÁRÓLAG érvényes Mermaid.js 'mindmap' szintaxis legyen.
MINDEN szöveget tegyél dupla idézőjelbe!
Használj különböző osztályokat a színekhez (pl. ::icon(fa fa-star) vagy stílusok nélkül, de logikusan tagolva).
Fontos: A Mermaid mindmap szintaxist használd!
Példa:
mindmap
  root(("${topic}"))
    (( "Első ág" ))
      "Részlet 1"
      "Részlet 2"
    (( "Második ág" ))
      "Részlet 3"
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();
    text = text.replace(/^```mermaid\n?/, "").replace(/```$/, "").trim();
    if (!text.startsWith("mindmap")) text = "mindmap\n" + text;

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
