import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function stripSvgFence(value = "") {
  return String(value || "")
    .trim()
    .replace(/^```(?:svg|xml)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function extractSvg(raw) {
  const match = raw.match(/<svg[\s\S]*?<\/svg>/i);
  return match ? match[0] : null;
}

export default async function handler(req) {
  try {
    if (req.method === "GET") {
      return new Response(JSON.stringify({
        status: "ok",
        message: "generate-anatomy function is running.",
        aiConfigured: isAiConfigured()
      }), { headers: { "Content-Type": "application/json" } });
    }

    if (req.method !== "POST") return jsonError("Method not allowed", 405);
    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const { topic, lang = "hu" } = body;

    if (!topic) return jsonError("Topic is required", 400);

    const isHu = lang === "hu";

    const labelLang = isHu
      ? "Magyar nyelvű feliratokat használj minden struktúrán."
      : "Use English labels on all structures.";

    const styleGuide = `
SVG stílus útmutató:
- viewBox="0 0 600 500", width="100%", height="100%"
- Fehér háttér: <rect width="600" height="500" fill="white"/>
- Fő struktúrák: vastag körvonal (stroke-width="2-3"), oktatási célú színek
- Feliratok: font-family="Poppins, Arial, sans-serif", font-size="12-14"
- Nyilak: marker-end attribútummal, ha szükséges
- Legyen részletes, oktatási minőségű, szép és pontos
- Minden fő részt feliratozzuk vonalakkal (leader line-ok)
`;

    const prompt = isHu
      ? `Rajzolj oktatási célú anatómiai SVG ábrát erről: "${topic}".
${labelLang}
${styleGuide}
CSAK a tiszta SVG kódot add vissza, semmi mást. Kezdd: <svg`
      : `Draw an educational anatomical SVG diagram of: "${topic}".
${labelLang}
${styleGuide}
Return ONLY the raw SVG code, nothing else. Start with: <svg`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: isHu
          ? "Te egy oktatási anatómiai SVG rajzoló vagy. Kizárólag tiszta SVG kódot adj vissza, semmi mást. Minden felirat magyarul legyen."
          : "You are an educational anatomical SVG illustrator. Return only raw SVG code, nothing else. All labels must be in English.",
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const rawText = typeof result.text === "function" ? result.text() : result.text || "";
    const cleaned = stripSvgFence(rawText);
    const svg = extractSvg(cleaned) || cleaned;

    if (!svg || !svg.includes("<svg")) {
      return new Response(JSON.stringify({
        error: "Az AI nem tudott SVG ábrát generálni ehhez a témához.",
        raw: rawText.slice(0, 300)
      }), { status: 422, headers: { "Content-Type": "application/json" } });
    }

    // viewBox és width/height normalizálása
    let finalSvg = svg
      .replace(/width="[^"]*"/, 'width="100%"')
      .replace(/height="[^"]*"/, 'height="100%"');

    if (!finalSvg.includes("viewBox")) {
      finalSvg = finalSvg.replace("<svg", '<svg viewBox="0 0 600 500"');
    }

    return new Response(JSON.stringify({ svg: finalSvg, topic, lang }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Anatomy generation error:", error);
    return new Response(JSON.stringify({
      error: "Anatomy generation failed",
      details: error?.message || String(error)
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

