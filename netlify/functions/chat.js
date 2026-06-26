import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { detectLanguage, webSearch, imageSearch } from "./search-utils.mjs";

const getEnv = (key) => process.env[key];
const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

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
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      }
    }
  }), {
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

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function getSupabaseUser(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;
  const supabase = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch { return null; }
}

async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}`);

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
          if (text.length > 80) parts.push(`=== JEGYZET: ${title} ===\n${text}`);
        }
      }
    } catch (e) { console.error("Notes error:", e); }
  }
  return parts.join("\n\n");
}

function buildSystemInstruction() {
  return `You are the AMISEARCH educational assistant.
Always answer in the SAME language as the user's question.
Provide clear, structured, academically reliable explanations.
Use tables and bullet points when helpful.
If the user asks for a process or concept map, output a Mermaid mindmap block.
If the user asks for statistics or time-series data, output a Chart.js JSON config in a json-chart block.
Always end your answer with: "## Forrásjegyzék"`;
}

function buildPrompt({ message, notesContext, webContext, history }) {
  const historyText = (Array.isArray(history) ? history.slice(-8) : [])
    .map(item => `${item.role === "assistant" ? "AI" : "User"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return [
    notesContext ? `## NOTES\n${notesContext}\n\n` : "",
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ].filter(Boolean).join("");
}

async function classifyRequest(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Classify this request. If the user wants a real image or illustration, answer:\nTYPE: IMAGE\nQUERY: <English search phrase>\nOtherwise:\nTYPE: TEXT\nQUERY: -\n\nUser message: "${message}"` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 40 }
    });
    const text = result?.text || "";
    const type = (text.match(/TYPE:\s*(IMAGE|TEXT)/i)?.[1] || "TEXT").toUpperCase();
    const query = text.match(/QUERY:\s*(.+)/i)?.[1]?.trim() || message.slice(0, 60);
    return { type, searchQuery: query === "-" ? message.slice(0, 60) : query };
  } catch { return { type: "TEXT", searchQuery: message.slice(0, 60) }; }
}

export default async (req) => {
  try {
    if (req.method === "OPTIONS") return corsOptionsResponse();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    let body = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw);
    } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const quota = await checkQuota(user.id, "ai_questions");
    if (!quota.allowed) {
      return jsonResponse({ error: quota.message || "Quota exceeded", code: "quota_exceeded" }, 402);
    }

    const message = cleanText(body.message || body.query || "", 12000);
    if (!message) return jsonResponse({ error: "Missing message" }, 400);

    const classification = await classifyRequest(message);

    if (classification.type === "IMAGE") {
      const img = await imageSearch(classification.searchQuery);
      await incrementUsage(user.id, "ai_questions");
      if (!img) return singleChunkStream("Sajnálom, nem találtam szabadon felhasználható képet.\n\n## Forrásjegyzék");
      return singleChunkStream(`

![${img.title}](${img.url})

\n\n**${img.title}**  \nForrás: ${img.source}  \n${img.sourceUrl}\n\n## Forrásjegyzék\n- ${img.source}`);
    }

    const lang = await detectLanguage(message);
    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const webResult = await webSearch(message, lang);
    const webContext = webResult
      ? `=== SOURCE: ${webResult.source} ===\n${webResult.summary}\nURL: ${webResult.url}`
      : "";

    const promptText = buildPrompt({ message, notesContext, webContext, history: body.history || [] });

    await incrementUsage(user.id, "ai_questions");

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      systemInstruction: buildSystemInstruction(),
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
