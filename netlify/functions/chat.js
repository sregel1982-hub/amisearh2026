// netlify/functions/chat.js - AMISEARCH CHAT ENGINE V3 - TELJES, COMMIT-READY
// FIX: magyar őű áé + empty ID + UTF-8 stream + kép overflow
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
          if (chunk) {
            // FIX 1: NFC normalizálás - ez javítja a screenshoton lévő ő, ű, á egymásra csúszást
            const normalized = String(chunk).normalize('NFC');
            controller.enqueue(encoder.encode(normalized));
          }
        }
        controller.close();
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      }
    }
  }), {
    headers: {
      // FIX 2: UTF-8 charset explicit - böngésző tudja hogy magyar ékezetek jönnek
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function singleChunkStream(text) {
  async function* gen() { yield text.normalize('NFC'); }
  return textStreamResponse(gen());
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .normalize('NFC') // FIX: magyar ékezetek normalizálása
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

async function loadUserNotesContext(user, inlineNotes = "", preferredNoteId = null) {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}`);

  const supabase = getSupabaseAdmin();
  if (supabase && user?.id) {
    try {
      const collected = [];

      if (preferredNoteId) {
        const id = preferredNoteId;
        const tries = [
          supabase.from("jegyzetek").select("id, cim, original_name, text_content, processed").eq("user_id", user.id).eq("id", id).maybeSingle(),
          supabase.from("uploaded_notes").select("id, title, original_name, text_content").eq("uploader_identity_id", user.id).eq("id", id).maybeSingle(),
        ];
        for (const p of tries) {
          const { data } = await p;
          if (data) {
            collected.push(data);
            break;
          }
        }
      }

      const { data: jegyzetek } = await supabase
        .from("jegyzetek")
        .select("id, cim, original_name, text_content, processed")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(8);

      if (Array.isArray(jegyzetek)) {
        for (const note of jegyzetek) {
          if (collected.some((n) => String(n.id) === String(note.id))) continue;
          if (note.processed === false && !note.text_content) continue;
          collected.push(note);
        }
      }

      const { data: uploaded } = await supabase
        .from("uploaded_notes")
        .select("id, title, original_name, text_content")
        .eq("uploader_identity_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (Array.isArray(uploaded)) {
        for (const note of uploaded) {
          if (collected.some((n) => String(n.id) === String(note.id))) continue;
          collected.push(note);
        }
      }

      let added = 0;
      for (const note of collected) {
        if (added >= 5) break;
        const title = note.cim || note.title || note.original_name || "Jegyzet";
        const text = cleanText(note.text_content, 12000);
        if (text.length > 80) {
          parts.push(`=== JEGYZET: ${title} ===\n${text}`);
          added += 1;
        }
      }
    } catch (e) { console.error("Notes error:", e); }
  }
  return parts.join("\n\n");
}

function buildSystemInstruction() {
  return `You are the AMISEARCH educational assistant.
Always answer in the SAME language as the user's question.
Use proper UTF-8 Hungarian characters: ő, ű, á, é, í, ó, ú, Ö, Ü, Ő, Ű etc. Never replace them with o, u, a, e.
Provide clear, structured, academically reliable explanations.
Use markdown: ## for headings, - or 1. for lists, **bold** for key terms.
For math, use $...$ for inline and $$...$$ for display formulas.
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
    const notesContext = await loadUserNotesContext(user, body.notes || "", body.noteId || body.note_id || null);
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
