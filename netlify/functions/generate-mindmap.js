import { GoogleGenAI } from "@google/genai";

const getEnv = (key) =>
 (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
 if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

 let body;
 try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

 const { topic, lang = "hu" } = body;
 if (!topic) return new Response("Missing topic", { status: 400 });

 const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

 const prompt = `
Készíts egy gondolattérképet a következő témáról: ${topic}

A kimenet KIZÁRÓLAG érvényes Mermaid.js "mindmap" szintaxis legyen.

FONTOS SZABÁLYOK:
1. Csak "mindmap" típust használj!
2. Max 3 szint mélység (root -> ág -> levél)
3. RÖVID címkék: max 2-3 szó, max 30 karakter
4. NE használj speciális karaktereket: () / \ , ; :
5. Csak betűk, szóközök és kötőjel (-) megengedett
6. Minden szöveget tegyél dupla idézőjelbe: "szöveg"
7. A root legyen: root(("${topic}"))
8. Az ágak legyenek: (( "ág neve" ))
9. A levelek legyenek: "levél neve"

Példa helyes szintaxisra:
mindmap
  root(("Matematika"))
    (( "Algebra" ))
      "Lineáris algebra"
      "Absztrakt algebra"
    (( "Analízis" ))
      "Valós analízis"
      "Komplex analízis"

Készíts TÖMÖR, jól strukturált gondolattérképet!`;

 try {
  const result = await ai.models.generateContent({
   model: "gemini-2.5-flash",
   contents: [{ role: "user", parts: [{ text: prompt }] }]
  });

  let text = result.text || "";
  text = text.trim();
  text = text.replace(/^```mermaid\n?/, "").replace(/^```\n?/, "").replace(/```$/, "").trim();
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
  return new Response(JSON.stringify({ 
   error: "Generation failed: " + (error.message || error)
  }), {
   status: 500,
   headers: { "Content-Type": "application/json" }
  });
 }
}
