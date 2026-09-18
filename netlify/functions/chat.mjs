// netlify/functions/chat.mjs - AMISEARCH CHAT ENGINE V4.6
// Erősebb formázás + biztonságos képmarkdown + Gemini elsődleges

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
  if (inline) parts.push("=== FELTÖLTÖTT DOKUMENTUM ===\n" + inline);

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
        parts.push("=== JEGYZET: " + title + " ===\n" + text);
        added++;
      }
    }
  } catch (e) {
    console.error("Notes error:", e);
  }

  return parts.join("\n\n");
}

function buildSystemInstruction({ hasImage = false } = {}) {
  let base = `Te vagy az AMISEARCH oktatósegédje.
Mindig a felhasználó kérdésének nyelvén válaszolj.
Használj helyes magyar ékezeteket.

KRITIKUS FORMÁZÁSI SZABÁLYOK – EZEKET KÖTELEZŐ BETARTANI:

1. Minden új bekezdés ÚJ SORON kezdődjön.
2. Bekezdések között MINDIG legyen üres sor.
3. Fejezetcímeket ## jellel írj, saját soron, előtte és utána üres sorral.
4. Felsorolás minden eleme saját soron kezdődjön • vagy - jellel.
5. Soha ne írj több mondatot egyetlen sorba.
6. Matematikai képleteket LaTeX-ben írd: \( ... \) vagy \[ ... \]
7. A válasz végén MINDIG legyen ez a sor:

## Forrásjegyzék

Ha van forrás, sorold fel. Ha nincs, írd: Saját tudás alapján.

PÉLDA HELYES KIMENETRE:

## 1. Feladat

Adott a háromszög...

## Megoldás

Először kiszámítjuk a meredekségeket.

• AB oldal: ...
• BC oldal: ...

## Összefoglalás

A háromszög derékszögű a B csúcsnál.

## Forrásjegyzék

Saját tudás alapján.`;

  if (hasImage) {
    base += `

KÉP SZABÁLY:
A rendszer már beillesztett egy képet a válasz elejére.
SOHA ne írd le, hogy „szöveges AI vagyok”, „nem tudok képet mutatni” vagy hasonló mondatot.
A kép már ott van.`;
  }

  return base;
}

function buildPrompt({ message, notesContext, webContext, imageContext, history }) {
  const historyText = (Array.isArray(history) ? history.slice(-8) : [])
    .map((i) => (i.role === "assistant" ? "AI: " : "User: ") + cleanText(i.content, 2500))
    .join("\n");

  let prompt = "";
  if (notesContext) prompt += "## NOTES\n" + notesContext + "\n\n";
  if (imageContext) prompt += "## FOUND IMAGE\n" + imageContext + "\n\n";
  if (webContext) prompt += "## EXTERNAL SOURCES\n" + webContext + "\n\n";
  if (historyText) prompt += "## HISTORY\n" + historyText + "\n\n";
  prompt += "## QUESTION\n" + message;

  return prompt;
}

function guessLang(text) {
  return /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|jegyzet|vizsga|képet|kép)\b/i.test(String(text || ""))
    ? "hu"
    : "en";
}

function detectImageIntent(message) {
  const t = String(message || "").toLowerCase();
  return (
    /kép|képet|képeket|fotó|fotót|mutass|ábra|illusztráció|rajz|hogy néz ki|kép kellene|képet szeretnék|mutass egy|mutass nekem/i.test(t) ||
    /image|picture|photo|show me|illustration|diagram|draw|can you show/i.test(t)
  );
}

function normalizeImageResult(raw) {
  if (!raw) return null;
  const url = raw.url || raw.imageUrl || raw.image || raw.link || raw.src;
  if (!url) return null;
  return {
    url: url,
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
      .replace(/képet|kép|képeket|mutass|kellene|egy|a|az|szeretnék|legyen|kell|fotó|fotót/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (cleaned.length > 2) queries.push(cleaned);

    if (lang === "hu") {
      if (/macska|cica/i.test(message)) queries.push("cat");
      if (/dinoszaurusz/i.test(message)) queries.push("dinosaur");
      if (/óra|órák/i.test(message)) queries.push("clock watch");
      if (/tyrannosaurus|t-rex|trex/i.test(message)) queries.push("Tyrannosaurus rex");
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
  let md = "![" + (image.title || "Kép") + "](" + image.url + ")\n";
  md += "*" + (image.title || "Kép") + " – Forrás: " + (image.source || "Wikimedia Commons") + "*\n";
  if (image.sourceUrl) {
    md += "Forrás: " + image.sourceUrl + "\n";
  }
  return md + "\n";
}

async function* geminiChunks(promptText, systemInstruction) {
  if (!geminiAi) throw new Error("Gemini nincs konfigurálva");

  const strongSystem = systemInstruction + `

KRITIKUS TILALOM:
Soha ne írd le ezeket a mondatokat:
- „szöveges alapú mesterséges intelligencia”
- „nem tudok képeket megjeleníteni”
- „nem tudok képet generálni”
- „sajnos nem rendelkezem képmegjelenítő funkcióval”
Ha képet kértek, és van kép, csak magyarázz.`;

  const stream = await geminiAi.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    config: {
      systemInstruction: strongSystem,
      temperature: 0.3
    }
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
      Authorization: "Bearer " + apiKey
    },
    body: JSON.stringify({
      model: model,
      stream: true,
      temperature: 0.3,
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
  if (!resp.ok || !resp.body) throw new Error("Groq hiba: " + resp.status);
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
    if (sr?.summary) webContext = sr.summary + "\n\n(Forrás: " + sr.source + ")";
  } catch {}

  let image = null;
  let imageMarkdown = "";
  if (detectImageIntent(message)) {
    image = await findImage(message, lang);
    imageMarkdown = buildImageMarkdown(image);
  }

  const systemInstruction = buildSystemInstruction({ hasImage: !!image });
  const promptText = buildPrompt({
    message: message,
    notesContext: notesContext,
    webContext: webContext,
    imageContext: image ? image.title + " — " + image.url + " — " + image.sourceUrl : "",
    history: history
  });

  incrementUsage(user?.id).catch(() => {});

  // Gemini elsődleges
  try {
    if (hasGemini) {
      return textStreamResponse(prependImage(imageMarkdown, geminiChunks(promptText, systemInstruction)));
    }
  } catch (err) {
    console.error("Gemini hiba:", err?.message);
  }

  // Groq fallback
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
