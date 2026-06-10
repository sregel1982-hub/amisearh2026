import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, extractText, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function stripEmoji(text = "") {
  return String(text)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "")
    .trim();
}

function cleanLabel(raw = "") {
  let s = stripEmoji(raw)
    .replace(/^[-*•]+\s*/, "")
    .replace(/^root\s*\(\(\s*/i, "")
    .replace(/^root\s*\(\s*/i, "")
    .replace(/^root\s*\[\s*/i, "")
    .replace(/[\]\)]\s*$/g, "")
    .replace(/^['\"`]+|['\"`]+$/g, "")
    .replace(/[{}\[\]<>|]/g, " ")
    .replace(/\(\((.*?)\)\)/g, "($1)")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\'\"`]+|[\'\"`]+$/g, "");
  s = s.replace(/\"/g, "'").trim();
  return s || "Téma";
}

export function sanitizeMindmapCode(code = "", topic = "Gondolattérkép") {
  const raw = String(code || "")
    .replace(/^```(?:mermaid|mindmap)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .replace(/\r/g, "")
    .trim();

  const sourceLines = raw.split("\n").map((line) => line.replace(/\t/g, "  ")).filter((line) => line.trim());
  const out = ["mindmap"];
  let hasRoot = false;

  for (const line of sourceLines) {
    const trimmed = line.trim();
    if (!trimmed || /^```/.test(trimmed) || /^mindmap\s*$/i.test(trimmed)) continue;

    const leading = Math.max(0, line.match(/^\s*/)?.[0]?.length || 0);
    let level = Math.max(1, Math.round(leading / 2));
    let label = cleanLabel(trimmed);

    if (/^root\s*[\(\[]/i.test(trimmed) || !hasRoot) {
      out.push('  root(("' + cleanLabel(label || topic) + '"))');
      hasRoot = true;
      continue;
    }

    if (level < 2) level = 2;
    out.push("  ".repeat(level) + label);
  }

  if (!hasRoot) {
    out.splice(1, 0, '  root(("' + cleanLabel(topic) + '"))');
  }

  return out.join("\n");
}

function fallbackMindmap(topic = "Gondolattérkép") {
  const safeTopic = cleanLabel(topic);
  return [
    "mindmap",
    '  root(("' + safeTopic + '"))',
    "    Alapfogalmak",
    "      Mit jelent",
    "      Kulcsszavak",
    "    Fontos szabályok",
    "      Definíciók",
    "      Példák",
    "    Gyakorlás",
    "      Feladatok",
    "      Ellenőrzés"
  ].join("\n");
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405);

    const body = await req.json().catch(() => ({}));
    const { topic, lang = "hu" } = body;
    if (!topic) return jsonError("Topic is required", 400);

    if (!isAiConfigured()) {
      return new Response(JSON.stringify({ code: fallbackMindmap(topic), fallback: true }), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    const prompt = `Készíts Mermaid mindmap kódot a következő témáról: ${topic}\n\nKötelező szabályok:\n- Csak Mermaid kódot adj vissza, magyarázat nélkül.\n- Az első sor pontosan: mindmap\n- A második sor root legyen.\n- Ne használj emojit.\n- Ne használj Markdown kódblokkot.\n- Ne használj idézőjeleket a sima ágaknál.\n- Ne használj dupla zárójeleket az ágak szövegében, például tilos: Alap ((a)). Helyette: Alap (a).\n- Ne használj kapcsos, szögletes zárójelet vagy pipe karaktert.\n- Legyen rövid, stabil, tanulóknak érthető, magyar nyelvű.\n`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "Te Mermaid mindmap generátor vagy. Csak érvényes, rövid Mermaid mindmap kódot adhatsz vissza."
      }
    });

    const text = sanitizeMindmapCode(extractText(result), topic);

    return new Response(JSON.stringify({ code: text }), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  } catch (error) {
    console.error("Mindmap generation error:", error);
    const body = await req.json().catch(() => ({}));
    return new Response(JSON.stringify({ code: fallbackMindmap(body.topic || "Gondolattérkép"), fallback: true }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
      status: 200
    });
  }
}
