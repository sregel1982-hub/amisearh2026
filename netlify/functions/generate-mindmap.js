import { GoogleGenerativeAI } from "@google/generative-ai";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { topic, lang = "hu" } = body;
  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(getEnv("GEMINI_API_KEY"));
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
Te egy oktatási segéd vagy. Készíts egy részletes, logikus gondolattérképet a következő témáról: ${topic}.
A kimenet KIZÁRÓLAG érvényes Mermaid.js 'mindmap' szintaxis legyen.
Ne használj markdown kódblokkokat (pl. \`\`\`mermaid), csak a tiszta kódot.
Használj gyökér elemet így: root((Téma)).
A szinteket behúzással jelöld.
Nyelv: ${lang === 'hu' ? 'Magyar' : 'Angol'}.
Példa:
mindmap
  root((Matematika))
    Algebra
      Egyenletek
    Geometria
      Háromszögek
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Tisztítás, ha az AI mégis tenne bele kódblokk jelölőt
    text = text.replace(/^```mermaid\n?/, "").replace(/```$/, "").trim();

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Mindmap generation failed:", error);
    return new Response(JSON.stringify({ error: "Generation failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
