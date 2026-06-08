import { GoogleGenAI } from "@google/genai";

const getEnv = (key) =>
 (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
 if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

 let body;
 try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

 const { topic, lang = "hu" } = body;
 if (!topic) return new Response("Missing topic", { status: 400 });

 // JAVÍTÁS: GoogleGenAI használata (ugyanaz, mint a chat.js)
 const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

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
  // JAVÍTÁS: GoogleGenAI API hívás (ugyanaz, mint a chat.js)
  const result = await ai.models.generateContent({
   model: "gemini-2.5-flash",
   contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  let text = result.text || "";
  text = text.trim();
  text = text.replace(/^```mermaid\n?/, "").replace(/```$/, "").trim();
  if (!text.startsWith("mindmap")) text = "mindmap\n" + text;

  const siteUrl = getEnv("URL") || "https://amisearh.org";
  const mindmapUrl = `${siteUrl}/mindmap.html?topic=${encodeURIComponent(topic)}`;

  return new Response(JSON.stringify({
   code: text,
   url: mindmapUrl,
   topic: topic
  }), {
   headers: { "Content-Type": "application/json" }
  });
 } catch (error) {
  // Részletes hibaüzenet visszaadása
  return new Response(JSON.stringify({ 
   error: "Generation failed: " + (error.message || error),
   stack: error.stack || "No stack trace"
  }), {
   status: 500,
   headers: { "Content-Type": "application/json" }
  });
 }
}
