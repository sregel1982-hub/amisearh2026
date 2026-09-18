// netlify/functions/chat.mjs - AMISEARCH CHAT ENGINE V4.5
// FIX: erősebb formázás + megbízhatóbb képkeresés

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { webSearch, imageSearch } from "./search-utils.mjs";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get?.(key));
const hasGroq = !!getEnv("GROQ_API_KEY");
const hasGemini = !!getEnv("GEMINI_API_KEY");
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

function textStreamResponse(generator) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            if (chunk) {
              controller.enqueue(
                encoder.encode(String(chunk).normalize("NFC").replace(/\r\n/g, "\n"))
              );
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      }
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

function cleanText(v, max = 70000) {
  return String(v || "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{5,}/g, "\n\n\n\n")
    .trim()
    .slice(0, max);
}

export function formatExportContent(rawText) {
  return String(rawText || "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([^\n])(#{1,6}.+)/g, "$1\n\n$2")
    .replace(/([^\n])(• |\- |\* |\d+\.\s)/g, "$1\n$2")
    .replace(/\n{5,}/g, "\n\n\n")
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
  } catch {
    return null;
  }
}

async function loadUserNotesContext(user, inlineNotes = "", preferredNoteId = null) {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}`);

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const collected = [];
    if (preferredNoteId) {
      const tries = [
        supabase.from("jegyzetek").select("id, cim, original_name, text_content, processed").eq("user_id", user.id).eq("id", preferredNoteId).maybeSingle(),
        supabase.from("uploaded_notes").select("id, title, original_name, text_content").eq("uploader_identity_id", user.id).eq("id", preferredNoteId).maybeSingle()
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
        parts.push(`=== JEGYZET: \( {title} ===\n \){text}`);
        added++;
      }
    }
  } catch (e) {
    console.error("Notes error:", e);
  }

  return parts.join("\n\n");
}

function buildSystemInstruction({ hasImage = false } = {}) {
  const base = `Te vagy az AMISEARCH oktatósegédje.
Mindig a felhasználó kérdésének nyelvén válaszolj (magyarul, ha magyar a kérdés).
Használj helyes magyar ékezeteket: ő, ű, á, é, í, ó, ú, ö, ü, Ő, Ű, Á, É, Í, Ó, Ú, Ö, Ü.

## KÖTELEZŐ FORMÁZÁSI SZABÁLYOK (SZIGORÚAN BE TARTANDÓ):
- Minden bekezdés KÜLÖN SORON kezdődjön!
- Bekezdések között HAGYJ ÜRES SORT!
- Fejezetcímek: ## címmel, saját soron, előtte és utána üres sor
- Felsorolás: minden elem KÜLÖN SORON kezdődjön • vagy - jellel
- Soha ne írj több mondatot egy sorba!
- Soha ne egyesítsd a felsorolás elemeit egy sorba!
- Használj **félkövér** kiemelést a fontos fogalmaknál
- Matematikai képleteket LaTeX-ben írd: \( f'(x) \) vagy \[ ... \]

## PÉLDA HELYES FORMÁZÁSRA:

## Definíció

A deriválás a differenciálszámítás alapművelete.

## Jelölések

• Lagrange-féle: \( f'(x) \)
• Leibniz-féle: \( \\frac{dy}{dx} \)

A válasz végére MINDIG írd ki:

## Forrásjegyzék`;

  if (hasImage) {
    return base + `

## KÉP SZABÁLY (NAGYON FONTOS):
A rendszer MÁR BEILLESZTETT egy képet a válasz legelső sorába.
SOHA ne mondd, hogy „nem tudok képet mutatni”, „szöveges AI vagyok” vagy „nem rendelkezem képmegjelenítő funkcióval”.
A kép már ott van. Csak röviden reflektálj rá (pl. „Íme egy illusztráció:”), majd folytasd a magyarázatot.`;
  }

  return base;
}

function buildPrompt({ message, notesContext, webContext, imageContext, history }) {
  const historyText = (Array.isArray(history) ? history.slice(-8) : [])
    .map((i) => `${i.role === "assistant" ? "AI" : "User"}: ${cleanText(i.content, 2500)}`)
    .join("\n");

  return [
    notesContext ? `## NOTES\n${notesContext}\n\n` : "",
    imageContext ? `## FOUND IMAGE\n${imageContext}\n\n` : "",
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ]
    .filter(Boolean)
    .join("");
}

function guessLang(text) {
  return /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|jegyzet|vizsga|képet|kép)\b/i.test(String(text || ""))
    ? "hu"
    : "en";
}

function detectImageIntent(message) {
  const t = String(message || "").toLowerCase();
  return (
    /\b(kép|képet|képeket|fotó|mutass|ábra|illusztráció|rajz|hogy néz ki|kép kellene|képet szeretnék)\b/.test(t) ||
    /\b(image|picture|photo|show me|illustration|diagram|draw)\b/.test(t)
  );
}

function normalizeImageResult(raw) {
  if (!raw) return null;
  const url = raw.url || raw.imageUrl || raw.image || raw.link || raw.src;
  if (!url) return null;
  return {
    url,
    title: raw.title || raw.alt || "Kép",
    source: raw.source || "Wikimedia Commons",
    sourceUrl: raw.sourceUrl || raw.pageUrl || raw.link || ""
  };
}

async function findImage(message, lang) {
  if (typeof imageSearch !== "function") return null;

  try {
    const queries = [];

    queries.push(message.slice(0, 120));

    const cleaned = message
      .replace(/képet|kép|képeket|mutass|kellene|egy|a|az|szeretnék|legyen|kell/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (cleaned.length > 2) queries.push(cleaned);

    if (lang === "hu") {
      if (/dinoszaurusz/i.test(message)) queries.push("dinosaur");
      if (/tyrannosaurus|t-rex|trex/i.test(message)) queries.push("Tyrannosaurus rex");
      if (/triceratops/i.test(message)) queries.push("Triceratops");
      if (/vulkán/i.test(message)) queries.push("volcano");
      if (/ember|emberi test|anatómi/i.test(message)) queries.push("human anatomy");
      if (/sejt/i.test(message)) queries.push("cell biology");
      if (/atom|molekula/i.test(message)) queries.push("atom molecule");
    }

    for (const q of queries) {
      if (!q || q.length < 3) continue;
      const result = await Promise.race([
        imageSearch(q, lang),
        new Promise((r) => setTimeout(() => r(null), 4500))
      ]);
      const normalized = normalizeImageResult(result);
      if (normalized) return normalized;
    }
    return null;
  } catch {
    return null;
  }
}

function buildImageMarkdown(image) {
  if (!image) return "";
  let md = `![\( {image.title}]( \){image.url})\n`;
  md += `*${image.title} – Forrás: ${image.source}*\n`;
  if (image.sourceUrl) {
    md += `Forrás: \( {image.source}\n \){image.sourceUrl}\n`;
  }
  md += `\n`;
  return md;
}

async function* geminiChunks(promptText, systemInstruction) {
  if (!geminiAi) throw new Error("Gemini nincs konfigurálva");
  const stream = await geminiAi.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    config: { systemInstruction, temperature: 0.35 }
  });
  for await (const chunk of stream) {
    const text = typeof chunk?.text === "function" ? chunk.text() : chunk?.text;
    if (text) yield text.replace(/\r\n/g, "\n");
  }
}

async function requestGroqCompletion(apiKey, model, promptText, systemInstruction) {
  return fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      stream: true,
      temperature: 0.35,
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
  if (!apiKey) throw new Error("Groq nincs konfigurálva");

  const primary = getEnv("GROQ_MODEL") || "llama3-70b-8192";
  const fallback = "llama3-8b-8192";

  let resp = await requestGroqCompletion(apiKey, primary, promptText, systemInstruction);
  if (!resp.ok && primary !== fallback) {
    resp = await requestGroqCompletion(apiKey, fallback, promptText, systemInstruction);
  }
  if (!resp.ok || !resp.body) throw new Error(`Groq hiba: ${resp.status}`);
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
        if (delta) yield delta;
      } catch {}
    }
  }
}

async function* prependImage(imageMarkdown, inner) {
  if (imageMarkdown) yield imageMarkdown;
  for await (const c of inner) yield c;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") return corsOptionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Nem engedélyezett metódus" }, 405);
  if (!hasGroq && !hasGemini) {
    return jsonResponse({ error: "AI szolgáltatás nincs beállítva", code: "ai_unavailable" }, 503);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Érvénytelen kérés" }, 400);
  }

  const message = cleanText(body?.message, 12000);
  if (!message) return jsonResponse({ error: "Kérdés hiányzik" }, 400);

  const user = await getSupabaseUser(req);
  let quota;
  try {
    quota = await checkQuota(user?.id);
  } catch {
    quota = { allowed: true };
  }
  if (!quota.allowed) return jsonResponse({ error: quota.message || "Limit elérve" }, 402);

  const history = Array.isArray(body?.history) ? body.history : [];
  const inlineNotes = typeof body?.notes === "string" ? body.notes : "";
  const noteId = body?.noteId || null;

  let notesContext = "";
  try {
    notesContext = await loadUserNotesContext(user, inlineNotes, noteId);
  } catch (e) {
    console.error(e);
  }

  const lang = guessLang(message);

  let webContext = "";
  try {
    const sr = await Promise.race([
      webSearch(message.slice(0, 200), lang),
      new Promise((r) => setTimeout(() => r(null), 4000))
    ]);
    if (sr?.summary) webContext = `${sr.summary}\n\n(Forrás: ${sr.source})`;
  } catch {}

  let image = null;
  let imageMarkdown = "";
  if (detectImageIntent(message)) {
    image = await findImage(message, lang);
    imageMarkdown = buildImageMarkdown(image);
  }

  const systemInstruction = buildSystemInstruction({ hasImage: !!image });
  const promptText = buildPrompt({
    message,
    notesContext,
    webContext,
    imageContext: image ? `${image.title} — ${image.url} — ${image.sourceUrl}` : "",
    history
  });

  incrementUsage(user?.id).catch(() => {});

  try {
    if (hasGemini) {
      return textStreamResponse(prependImage(imageMarkdown, geminiChunks(promptText, systemInstruction)));
    }
  } catch (err) {
    console.error("Gemini hiba:", err?.message);
  }

  try {
    if (hasGroq) {
      const resp = await fetchGroqStream(promptText, systemInstruction);
      return textStreamResponse(prependImage(imageMarkdown, groqChunks(resp)));
    }
  } catch (err2) {
    console.error("Groq hiba:", err2?.message);
  }

  return jsonResponse({ error: "AI szolgáltatás nem elérhető", code: "ai_unavailable" }, 503);
}
