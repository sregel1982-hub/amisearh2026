// ===============================
// AMISEARCH 2026 – CHAT ENGINE (MAIN)
// chat.js – Blokk 1/3
// Importok + ENV + Helper + Auth + Notes Loader
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { 
  detectLanguage,
  webSearch,
  imageSearch
} from "./search-utils.mjs";

// -------------------------------
// ENV KEZELÉS
// -------------------------------

const getEnv = (key) => process.env[key];

const requiredEnv = [
  "GEMINI_API_KEY",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

for (const key of requiredEnv) {
  if (!getEnv(key)) console.error(`Hiányzó env változó: ${key}`);
}

const ai = new GoogleGenAI({
  apiKey: getEnv("GEMINI_API_KEY")
});

// -------------------------------
// JSON RESPONSE
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

// -------------------------------
// CORS OPTIONS
// -------------------------------

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

// -------------------------------
// STREAMING RESPONSE
// -------------------------------

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
        console.error("Stream error:", err);
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
// SUPABASE ADMIN CLIENT
// -------------------------------

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

// -------------------------------
// TEXT CLEANER
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
  } catch (e) {
    console.error("Auth error:", e);
    return null;
  }
}

// -------------------------------
// NOTES LOADER
// -------------------------------

async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);

  if (inline) {
    parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}`);
  }

  const supabase = getSupabaseAdmin();
  if (supabase && user?.id) {
    try {
      const { data } = await supabase
        .from("jegyzetek")
        .select("cim, original_name, text_content")
        .eq("user_id", user.id)
        .eq("processed", true)
        .order("created_at", { ascending: false })
        .limit(5);

      if (Array.isArray(data)) {
        for (const note of data) {
          const title = note.cim || note.original_name || "Jegyzet";
          const text = cleanText(note.text_content, 12000);
          if (text.length > 80) {
            parts.push(`=== JEGYZET: ${title} ===\n${text}`);
          }
        }
      }
    } catch (e) {
      console.error("Notes error:", e);
    }
  }

  return parts.join("\n\n");
}

export {
  jsonResponse,
  corsOptionsResponse,
  textStreamResponse,
  singleChunkStream,
  getSupabaseUser,
  loadUserNotesContext,
  cleanText,
  detectLanguage,
  webSearch,
  imageSearch,
  ai
};
// ===============================
// AMISEARCH 2026 – CHAT ENGINE (MAIN)
// chat.js – Blokk 2/3
// System Prompt + Prompt Builder + Classification
// ===============================

import {
  detectLanguage,
  webSearch,
  imageSearch
} from "./search-utils.mjs";

import { cleanText } from "./chat.js"; // circular import kerülése miatt NEM használjuk így

// -------------------------------
// SYSTEM INSTRUCTION (AI BEÁLLÍTÁS)
// -------------------------------

function buildSystemInstructionText() {
  return `
You are the AMISEARCH educational assistant.

LANGUAGE RULE:
- Detect the user's question language automatically.
- Always answer in the SAME language as the user's question.
- If the question mixes languages, use the dominant one.

ANSWERING RULES:
- Provide clear, structured, academically reliable explanations.
- Use tables and bullet points when helpful.
- Use the external sources provided in the prompt (Academic → Wikipedia → DuckDuckGo → Notes).
- Combine external sources with your own knowledge.
- NEVER hallucinate facts. If uncertain, say so.

VISUALIZATION RULES:
1) If the user asks for a process, structure, concept map, or mindmap:
   - Provide a short explanation.
   - Then output a Mermaid MINDMAP block:
   \`\`\`mermaid
   mindmap
     root((Topic))
       Branch 1
         Sub-branch
       Branch 2
   \`\`\`
   - DO NOT use flowchart, pie, or xychart-beta.

2) If the user asks for numeric data, statistics, or time-series:
   - Provide a short explanation.
   - Then output a Chart.js JSON config inside:
   \`\`\`json-chart
   { ... }
   \`\`\`
   - Only pure JSON allowed.

FINAL REQUIREMENT:
- Always end the answer with: "## Forrásjegyzék"
`;
}

// -------------------------------
// PROMPT BUILDER
// -------------------------------

function buildPrompt({ message, notesContext, webContext, history }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];

  const historyText = historyArray
    .map(item =>
      `${item.role === "assistant" ? "AI" : "User"}: ${cleanText(item.content, 2500)}`
    )
    .join("\n");

  return [
    notesContext ? `## NOTES\n${notesContext}\n\n` : "",
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ]
    .filter(Boolean)
    .join("");
}

// -------------------------------
// REQUEST CLASSIFICATION (IMAGE vs TEXT)
// -------------------------------

async function classifyRequest(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Classify the request.

If the user wants a REAL IMAGE or ILLUSTRATION of a person, object, animal, etc. (e.g. "show me a picture of X"), answer:

TYPE: IMAGE
QUERY: <English search phrase>

Otherwise answer:

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
  } catch (err) {
    return { type: "TEXT", searchQuery: "" };
  }
}

// -------------------------------
// EXPORT
// -------------------------------

export {
  buildSystemInstructionText,
  buildPrompt,
  classifyRequest
};
// ===============================
// AMISEARCH 2026 – CHAT ENGINE (MAIN)
// chat.js – Blokk 3/3
// Handler + Quota + Notes + WebSearch + ImageSearch + Streaming
// ===============================

import {
  jsonResponse,
  corsOptionsResponse,
  textStreamResponse,
  singleChunkStream,
  getSupabaseUser,
  loadUserNotesContext,
  cleanText,
  detectLanguage,
  webSearch,
  imageSearch,
  ai
} from "./chat.js";

import {
  buildSystemInstructionText,
  buildPrompt,
  classifyRequest
} from "./chat.js";

import { checkQuota, incrementUsage } from "./quota.js";

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

    const quota = await checkQuota(user.id, "ai_questions");
    if (!quota.allowed) {
      return jsonResponse({
        error: quota.message || "AI quota exceeded",
        code: "quota_exceeded",
        field: "ai_questions"
      }, 402);
    }

    const message = cleanText(body.message || body.query || "", 12000);
    if (!message) return jsonResponse({ error: "Missing message" }, 400);

    const classification = await classifyRequest(message);

    if (classification.type === "IMAGE") {
      const img = await imageSearch(classification.searchQuery);
      await incrementUsage(user.id, "ai_questions");

      if (!img) {
        return singleChunkStream("Sajnálom, nem találtam szabadon felhasználható képet ehhez a témához.\n\n## Forrásjegyzék");
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

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const webContext = await webSearch(message, lang);

    const promptText = buildPrompt({
      message,
      notesContext,
      webContext: webContext
        ? `=== SOURCE: ${webContext.source} ===\n${webContext.summary}\nURL: ${webContext.url}`
        : "",
      history: body.history || []
    });

    await incrementUsage(user.id, "ai_questions");

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
    console.error("Fatal error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
