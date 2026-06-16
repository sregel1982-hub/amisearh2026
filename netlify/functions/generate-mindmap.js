import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function stripCodeFence(value = "") {
  return String(value || "")
    .trim()
    .replace(/^```(?:markdown|md|markmap)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

function sanitizeMarkmapMarkdown(value, topic) {
  let text = stripCodeFence(value)
    .replace(/^---[\s\S]*?---\s*/m, "")
    .split("\n")
    .map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""))
    .filter((line) => !/^\s*```/.test(line))
    .join("\n")
    .trim();

  // Ha a modell véletlenül Mermaid jellegű bevezetést adna, azt eltávolítjuk.
  text = text
    .replace(/^mindmap\b\s*/i, "")
    .replace(/^graph\b.*$/im, "")
    .replace(/^flowchart\b.*$/im, "")
    .trim();

  if (!text.startsWith("#")) {
    text = `# ${topic}\n${text}`.trim();
  }

  return text;
}

export default async function handler(req) {
  try {
    console.log("✅ generate-mindmap.js fut Markmap módban.");

    if (req.method !== "POST") return jsonError("Method not allowed", 405);
    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const { topic, lang = "hu" } = body;

    if (!topic) return jsonError("Topic is required", 400);

    const languageLabel = lang === "en" ? "English" : "Hungarian";
    const prompt = `Készíts Markmap-kompatibilis Markdown gondolattérképet a következő témáról: "${topic}".

Kötelező formátum:
# ${topic}
## Fő ág 1
- rövid alpont
- rövid alpont
## Fő ág 2
- rövid alpont
  - részlet

Szabályok:
- Csak Markdown vázlatot adj vissza, sem Mermaid, sem flowchart, sem kódfence ne legyen.
- Ne használj idézőjelbe tett Mermaid node-okat, zárójeles node-szintaxist, nyilakat vagy ID-ket.
- A kimenet ${languageLabel} nyelvű legyen.
- Legyen 5-8 fő ág, fő ágonként 2-5 rövid alponttal.
- A sorok legyenek tömörek, Markmapben jól olvashatóak.`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "Te Markmap Markdown gondolattérkép-generátor vagy. Kizárólag tiszta Markdown vázlatot adj vissza. Tilos Mermaid, flowchart, graph vagy kódfence használata.",
        temperature: 0.35,
      },
    });

    const rawText = typeof result.text === "function" ? result.text() : result.text || "";
    const markdown = sanitizeMarkmapMarkdown(rawText, topic);

    return new Response(JSON.stringify({ code: markdown, markdown, format: "markmap" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Mindmap generation error:", error);
    return aiUnavailableResponse();
  }
}
