// netlify/functions/chat.js - AMISEARCH CHAT ENGINE V4 - GEMINI FIRST + EXPORT FORMATTING FIX
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { detectLanguage, webSearch, imageSearch } from "./search-utils.mjs";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get?.(key));

const hasGroq = !!getEnv("GROQ_API_KEY");
const hasGemini = !!getEnv("GEMINI_API_KEY");

// ✅ GEMINI ELSŐDLEGES
const geminiAi = hasGemini ? new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") }) : null;

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

// ✅ Javított stream — formázás megőrzése exportáláshoz
function textStreamResponse(generator) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (chunk) {
            const normalized = String(chunk)
              .normalize('NFC')
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n");
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
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function singleChunkStream(text) {
  async function* gen() { 
    yield text.normalize('NFC')
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n"); 
  }
  return textStreamResponse(gen());
}

// ✅ Javított szövegtisztítás — sortörések és formázás megőrzése
function cleanText(value, max = 70000) {
  return String(value || "")
    .normalize('NFC')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{5,}/g, "\n\n\n\n") // Maximum 4 egymás utáni sortörés
    .trim()
    .slice(0, max);
}

// ✅ Export-barát formázás — PDF/Word-hez
function formatForExport(text) {
  return text
    .normalize('NFC')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Fejezetcímek — extra sortörés
    .replace(/^(## .+)$/gm, "\n$1\n")
    // Félkövér szöveg megőrzése
    .replace(/\*\*(.+?)\*\*/g, "$1")
    // Listaelemek — egységes behúzás
    .replace(/^- /gm, "• ")
    .replace(/^(\d+)\. /gm, "$1. ")
    // Képletek — egyszerűsítés, de megtartás
    .replace(/\$(.+?)\$/g, "($1)")
    .replace(/\$\$(.+?)\$\$/g, "\n[$1]\n")
    // Összefolyás megakadályozása
    .replace(/([^\n])(## )/g, "$1\n\n$2")
    .replace(/([^\n])(• |\d+\. )/g, "$1\n$2")
    .trim();
}

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
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
Use proper UTF-8 Hungarian characters: ő, ű, á, é, í, ó, ú, ö, ü, Ő, Ű, Á, É, Í, Ó, Ú, Ö, Ü etc. Never replace them with o, u, a, e.
Provide clear, structured, academically reliable explanations.
Use markdown: ## for headings, - or 1. for lists, **bold** for key terms.
For math, use $...$ for inline and $$...$$ for display formulas.
If the user asks for a process or concept map, output a Mermaid mindmap block.
If the user asks for statistics or time-series data, output a Chart.js JSON config in a json-chart block.
## FORMATTING RULES FOR EXPORT:
- Always use CLEAR line breaks between sections
- Place each paragraph on its own line
- Use blank lines between headings and content
- Do NOT collapse multiple paragraphs into one line
- End your answer with: "## Forrásjegyzék"`;
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

function guessLang(text) {
  const t = String(text || "");
  const hunPattern = /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|egy|nem|van|mit|hol|kérem|keresés|jegyzet|tantárgy|vizsga|tétel|fejezet|miért|hogyan)\b/i;
  return hunPattern.test(t) ? "hu" : "en";
}

// -------------------------------
// GEMINI STREAM — ELSŐDLEGES
// -------------------------------

async function* geminiChunks(promptText, systemInstruction) {
  if (!geminiAi) throw new Error("Gemini nincs konfigurálva (hiányzó GEMINI_API_KEY).");
  const stream = await geminiAi.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    config: { systemInstruction, temperature: 0.4 }
  });
  for await (const chunk of stream) {
    const text = typeof chunk?.text === "function" ? chunk.text() : chunk?.text;
    if (text) {
      yield text
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
    }
  }
}

// -------------------------------
// GROQ STREAM — TARTALÉK
// -------------------------------

async function requestGroqCompletion(apiKey, model, promptText, systemInstruction) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: promptText }
      ]
    })
  });
}

async function fetchGroqStream(promptText, systemInstruction) {
  const apiKey = getEnv("GROQ_API_KEY");
  if (!apiKey) throw new Error("Groq nincs konfigurálva (hiányzó GROQ_API_KEY).");

  const primaryModel = getEnv("GROQ_MODEL") || "openai/gpt-oss-120b";
  const fallbackModel = "openai/gpt-oss-20b";

  let resp = await requestGroqCompletion(apiKey, primaryModel, promptText, systemInstruction);

  if (!resp.ok && primaryModel !== fallbackModel) {
    console.error(`Groq modell (${primaryModel}) sikertelen, próba: ${fallbackModel}`);
    resp = await requestGroqCompletion(apiKey, fallbackModel, promptText, systemInstruction);
  }

  if (!resp.ok || !resp.body) {
    const errText = await resp.text().catch(() => "");
    throw new Error(`Groq API hiba (${resp.status}): ${errText.slice(0, 300)}`);
  }

  return resp;
}

async function* groqChunks(resp) {
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) {
          yield delta
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n");
        }
      } catch {}
    }
  }
}

// -------------------------------
// FŐ HANDLER — GEMINI AZ ELSŐDLEGES
// -------------------------------

export default async function handler(req) {
  if (req.method === "OPTIONS") return corsOptionsResponse();

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed", code: "method_not_allowed" }, 405);
  }

  if (!hasGroq && !hasGemini) {
    return jsonResponse({
      error: "Az AI szolgáltatás jelenleg nincs beállítva vagy nem elérhető.",
      code: "ai_unavailable"
    }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Érvénytelen JSON kérés.", code: "bad_request" }, 400);
  }

  const message = cleanText(body?.message, 12000);
  const history = Array.isArray(body?.history) ? body.history : [];
  const inlineNotes = typeof body?.notes === "string" ? body.notes : "";
  const noteId = body?.noteId || null;
  const forExport = body?.export === true; // Jelző, ha exportáljuk

  if (!message) {
    return jsonResponse({ error: "A kérdés (message) megadása kötelező.", code: "missing_message" }, 400);
  }

  const user = await getSupabaseUser(req);

  let quota;
  try {
    quota = await checkQuota(user?.id);
  } catch (e) {
    console.error("Quota check failed:", e);
    quota = { allowed: true };
  }

  if (!quota.allowed) {
    return jsonResponse({
      error: quota.message || "Havi AI limit elérve.",
      code: "quota_exceeded",
      limit: quota.limit,
      used: quota.used,
      plan: quota.plan
    }, 402);
  }

  let notesContext = "";
  try {
    notesContext = await loadUserNotesContext(user, inlineNotes, noteId);
  } catch (e) {
    console.error("Notes context error:", e);
  }

  let webContext = "";
  try {
    const lang = guessLang(message);
    const searchResult = await Promise.race([
      webSearch(message.slice(0, 200), lang),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000))
    ]);
    if (searchResult?.summary) {
      webContext = `${searchResult.summary}\n\n(Forrás: ${searchResult.source})`;
    }
  } catch (e) {
    console.error("Web search error:", e);
  }

  const systemInstruction = buildSystemInstruction();
  let promptText = buildPrompt({ message, notesContext, webContext, history });

  incrementUsage(user?.id).catch((e) => console.error("Usage increment error:", e));

  // ✅ GEMINI AZ ELSŐDLEGES — GROQ TARTALÉK
  try {
    if (hasGemini) {
      return textStreamResponse(geminiChunks(promptText, systemInstruction));
    }
    if (hasGroq) {
      const resp = await fetchGroqStream(promptText, systemInstruction);
      return textStreamResponse(groqChunks(resp));
    }
  } catch (err) {
    console.error("Gemini hívás sikertelen, Groq tartalék próbálása:", err?.message || err);
  }

  try {
    if (hasGemini && hasGroq) {
      const resp = await fetchGroqStream(promptText, systemInstruction);
      return textStreamResponse(groqChunks(resp));
    }
  } catch (err2) {
    console.error("Tartalék szolgáltató is sikertelen:", err2?.message || err2);
  }

  return jsonResponse({
    error: "Az AI szolgáltatás jelenleg nem elérhető. Próbáld újra később.",
    code: "ai_unavailable"
  }, 503);
}

// ✅ Külső exportáló függvény — ezt hívd a PDF/Word generálásakor
export async function formatExportContent(rawContent) {
  return formatForExport(rawContent);
}
// ==================================================
// ✅ KÜLÖN FORMÁZÓ MODUL — PDF/Word letöltéshez
// Másold be a chat.js fájl legvégére
// ==================================================

/**
 * Tiszta, olvasható formátumot biztosít a letöltött fájlhoz
 * Megoldja az összecsúszó sorok, hiányos sortörések problémáját
 */
export function formatExportContent(rawText) {
  if (!rawText || typeof rawText !== "string") return "";

  let text = rawText
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // 1. Fejezetcímek — mindig új sor + üres sorok
  text = text
    .replace(/([^\n])(#{1,6} .+)/g, "$1\n\n$2")
    .replace(/(#{1,6} .+)([^\n])/g, "$1\n$2");

  // 2. Felsorolások — minden elem ÚJ SORON kezdődjön
  text = text
    .replace(/([^\n])(• |\- |\* |\d+\.\s)/g, "$1\n$2")
    .replace(/(\.\s)([A-ZÁÉÍÓÚÖÜŐŰ])/g, "$1\n$2");

  // 3. Mondatok végén új sor ha felsorolás jön
  text = text
    .replace(/([.!?])\s+(• |\d+\.)/g, "$1\n$2");

  // 4. Hosszú szövegrészek tördelése olvasható szélességre
  const sorHossz = 85;
  const sorok = text.split("\n");
  const tordeltSorok = [];
  
  for (const sor of sorok) {
    if (sor.length <= sorHossz || sor.startsWith("#") || sor.startsWith("•") || /^\d+\./.test(sor)) {
      tordeltSorok.push(sor);
      continue;
    }
    // Hosszú sorok intelligens tördelése szóközöknél
    let marad = sor;
    while (marad.length > sorHossz) {
      const vagas = marad.lastIndexOf(" ", sorHossz);
      if (vagas === -1) break;
      tordeltSorok.push(marad.slice(0, vagas));
      marad = marad.slice(vagas + 1);
    }
    tordeltSorok.push(marad);
  }
  text = tordeltSorok.join("\n");

  // 5. Túl sok üres sor csökkentése
  text = text
    .replace(/\n{5,}/g, "\n\n\n")
    .trim();

  return text;
}

/**
 * Teljes fájl tartalom összeállítása fejléc + formázott tartalom
 */
export function buildExportContent(cim, nyersTartalom, datum = null) {
  const exportDatum = datum || new Date().toLocaleString("hu-HU");
  
  return `${cim}
Készült: ${exportDatum}
Forrás: AMISEARCH — amisearch.org

${"=".repeat(50)}

${formatExportContent(nyersTartalom)}

${"=".repeat(50)}
Készült az AMISEARCH segítségével 📚
`;
}

