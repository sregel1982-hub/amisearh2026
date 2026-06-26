// ===============================
// AMISEARCH 2026 – CHAT ENGINE (REDIRECT VERSION)
// chat-engine.mjs – FULL FILE
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

import {
  detectLanguage,
  webSearch,
  imageSearch
} from "./search-utils.mjs";

// -------------------------------
// ENV
// -------------------------------

const getEnv = (key) => process.env[key];

const ai = new GoogleGenAI({
  apiKey: getEnv("GEMINI_API_KEY")
});

// -------------------------------
// BASIC RESPONSES
// -------------------------------

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function corsOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

function textStreamResponse(generator) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function singleChunkStream(text) {
  async function* gen() { yield text; }
  return textStreamResponse(gen());
}

// -------------------------------
// SUPABASE AUTH
// -------------------------------

async function getSupabaseUser(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

// -------------------------------
// CLEAN TEXT
// -------------------------------

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

// -------------------------------
// SYSTEM PROMPT
// -------------------------------

function buildSystemInstructionText() {
  return `
You are the AMISEARCH educational assistant.

LANGUAGE:
- Detect the user's question language.
- Answer in the SAME language.

SOURCES:
- Use Academic → Wikipedia → DuckDuckGo → Notes.
- Combine with your own knowledge.
- Never hallucinate.

VISUALIZATION:
- Mindmap → Mermaid mindmap block.
- Numeric data → Chart.js JSON block.

REDIRECT RULES:
If the user asks for:
- deltoid → [REDIRECT:graph:geometry:deltoid]
- isosceles triangle → [REDIRECT:graph:geometry:triangle]
- parallelogram → [REDIRECT:graph:geometry:parallelogram]
- hexagon → [REDIRECT:graph:geometry:hexagon]
- NaCl → [REDIRECT:graph:molecule:nacl]
- H2O → [REDIRECT:graph:molecule:h2o]
- CO2 → [REDIRECT:graph:molecule:co2]
- CH4 → [REDIRECT:graph:molecule:ch4]
- quiz → [REDIRECT:quiz]

Always end with "## Forrásjegyzék".
`;
}

// -------------------------------
// PROMPT BUILDER
// -------------------------------

function buildPrompt({ message, webContext, history }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];

  const historyText = historyArray
    .map(item =>
      `${item.role === "assistant" ? "AI" : "User"}: ${cleanText(item.content, 2500)}`
    )
    .join("\n");

  return [
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ]
    .filter(Boolean)
    .join("");
}

// -------------------------------
// CLASSIFICATION
// -------------------------------

async function classifyRequest(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Classify the request.

If the user wants a REAL IMAGE or ILLUSTRATION, answer:
TYPE: IMAGE
QUERY: <English search phrase>

Else:
TYPE: TEXT
QUERY: -

User message: "${message}"`
        }]
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 40 }
    });

    const text = result?.text || "";
    const typeMatch = text.match(/TYPE:\s*(IMAGE|TEXT)/i);
    const queryMatch = text.match(/QUERY:\s*(.+)/i);

    const type = typeMatch ? typeMatch[1].toUpperCase() : "TEXT";
    let searchQuery = queryMatch ? queryMatch[1].trim() : "";

    if (searchQuery === "-" || !searchQuery) {
      searchQuery = message.slice(0, 60);
    }

    return { type, searchQuery };
  } catch {
    return { type: "TEXT", searchQuery: "" };
  }
}

// -------------------------------
// MAIN HANDLER
// -------------------------------

export default async (req) => {
  try {
    if (req.method === "OPTIONS") return corsOptionsResponse();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    let body = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const message = cleanText(body.message || body.query || "", 12000);
    if (!message) return jsonResponse({ error: "Missing message" }, 400);

    const classification = await classifyRequest(message);

    if (classification.type === "IMAGE") {
      const img = await imageSearch(classification.searchQuery);

      if (!img) {
        return singleChunkStream("Sajnálom, nem találtam szabadon felhasználható képet.\n\n## Forrásjegyzék");
      }

      const md = `![${img.title}](${img.url})

**${img.title}**  
Forrás: ${img.source}  
${img.sourceUrl}

## Forrásjegyzék
- ${img.source}`;

      return singleChunkStream(md);
    }

    const lang = await detectLanguage(message);

    const web = await webSearch(message, lang);

    const webContext = web
      ? `=== SOURCE: ${web.source} ===\n${web.summary}\nURL: ${web.url}`
      : "";

    const promptText = buildPrompt({
      message,
      webContext,
      history: body.history || []
    });

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      systemInstruction: buildSystemInstructionText(),
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
    });

    async function* generator() {
      for await (const chunk of stream) {
        const text = chunk?.text || "";
        if (text) yield text;
      }
    }

    return textStreamResponse(generator());

  } catch (err) {
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
