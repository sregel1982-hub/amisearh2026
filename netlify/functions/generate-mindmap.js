import { GoogleGenerativeAI } from "@google/genai";

const getEnv = (key) => {
  const value = (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];
  if (!value) console.error(`Környezeti változó hiányzik: ${key}`);
  return value;
};

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  console.log("✅ generate-mindmap.js fut.");
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  const { topic, lang = "hu" } = body;
  
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("GEMINI_API_KEY hiányzik generate-mindmap.js-ben.");
    return new Response(JSON.stringify({ error: "AI szolgáltatás nem elérhető: Hiányzó API kulcs." }), { status: 500 });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
Te egy oktatási segéd vagy. Készíts egy SZÍNES és VIDÁM gondolattérképet: ${topic}.
A kimenet Mermaid.js 'mindmap' legyen.
Minden ághoz rendelj egy egyedi színt vagy formát a Mermaid szintaxissal.
Minden szöveget tegyél dupla idézőjelbe.
Példa:
mindmap
  root(("${topic}"))
    (( "Ág 1" ))
    ::icon(fa fa-book)
    {{ "Ág 2" }}
    )) "Ág 3" ((
`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim().replace(/^```mermaid\n?/, "").replace(/```$/, "").trim();
    if (!text.startsWith("mindmap")) text = "mindmap\n" + text;

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Mindmap generálás hiba generate-mindmap.js-ben:", error);
    return new Response(JSON.stringify({ error: "AI generálás sikertelen." }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
