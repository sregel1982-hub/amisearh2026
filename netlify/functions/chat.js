// netlify/functions/chat.js - AMISEARCH CHAT ENGINE V4.3 - TISZTA ESM + GEMINI FIRST + KÉPKERESÉS JAVÍTVA
//
// ✅ JAVÍTVA (V4.3): az imageSearch() korábban importálva volt, de SOHA nem hívtuk meg.
//    Emiatt ha valaki képet kért ("kép kellene egy hajóról"), a modell nem kapott
//    képi találatot, és szövegben írta le, hogy "nem tud képet mutatni".
//    Most: intent-felismerés -> imageSearch() hívás -> a talált kép GARANTÁLTAN
//    bekerül a válasz elejére markdown képként, függetlenül attól, mit ír az AI.

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { detectLanguage, webSearch, imageSearch } from "./search-utils.mjs";

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
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .normalize('NFC')
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{5,}/g, "\n\n\n\n")
    .trim()
    .slice(0, max);
}

export function formatExportContent(rawText) {
  if (!rawText || typeof rawText !== "string") return "";
  return rawText
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/([^\n])(#{1,6} .+)/g, "$1\n\n$2")
    .replace(/([^\n])(• |\- |\* |\d+\.\s)/g, "$1\n$2")
    .replace(/([.!?])\s+(• |\d+\.)/g, "$1\n$2")
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
        supabase.from("uploaded_notes").select("id, title, original_name, text_content").eq("uploader_identity_id", user.id).eq("id", preferredNoteId).maybeSingle(),
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
        if (collected.some(n => String(n.id) === String(note.id))) continue;
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
        if (collected.some(n => String(n.id) === String(note.id))) continue;
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
        added++;
      }
    }
  } catch (e) {
    console.error("Notes error:", e);
  }

  return parts.join("\n\n");
}

function buildSystemInstruction({ hasImage = false } = {}) {
  const base = `You are the AMISEARCH educational assistant.
Always answer in the SAME language as the user's question.
Use proper UTF-8 Hungarian characters: ő, ű, á, é, í, ó, ú, ö, ü, Ő, Ű, Á, É, Í, Ó, Ú, Ö, Ü.
Provide clear, structured explanations.
Use markdown: ## for headings, - or 1. for lists, **bold** for key terms.
Each paragraph on its own line. Blank lines between sections.
End your answer with: "## Forrásjegyzék"`;

  // ✅ ÚJ: ha van talált kép, az AI-nak tudnia kell róla, és NEM szabad
  // azt állítania, hogy nem tud képet mutatni — mert a rendszer már beillesztette.
  if (hasImage) {
    return `${base}

FONTOS: A rendszer már talált és beillesztett egy releváns képet a válasz elejére.
NE írd le újra a képet szövegben, és SOHA ne mondd azt, hogy "nem tudok képet mutatni"
vagy "nem tudok képet generálni" — ez hamis, mert a kép már ott van a válaszban.
Csak röviden reflektálj a képre, és add meg a kért magyarázatot/szöveges tartalmat.`;
  }

  return `${base}

Ha a felhasználó képet vagy vizuális anyagot kér, és nem kaptál kép-forrást a rendszertől,
udvariasan jelezd, hogy jelenleg nem áll rendelkezésre találat, ne állíts valótlant a képességeidről.`;
}

function buildPrompt({ message, notesContext, webContext, imageContext, history }) {
  const historyText = (Array.isArray(history) ? history.slice(-8) : [])
    .map(item => `${item.role === "assistant" ? "AI" : "User"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return [
    notesContext ? `## NOTES\n${notesContext}\n\n` : "",
    imageContext ? `## FOUND IMAGE (already inserted into the reply, do not re-describe it)\n${imageContext}\n\n` : "",
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ].filter(Boolean).join("");
}

function guessLang(text) {
  const t = String(text || "");
  return /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|jegyzet|vizsga)\b/i.test(t) ? "hu" : "en";
}

// ==================================================
// ✅ ÚJ: kép-igény felismerése a kérdésből
// ==================================================
function detectImageIntent(message) {
  const t = String(message || "").toLowerCase();
  const huPattern = /\b(kép|képet|képeket|fotó|fotót|mutass|ábra|ábrát|illusztráció|rajz|nézd meg hogy néz ki|hogy néz ki)\b/;
  const enPattern = /\b(image|picture|photo|show me|what does .* look like|illustration|diagram|drawing)\b/;
  return huPattern.test(t) || enPattern.test(t);
}

// A keresőmotor eltérő mezőneveket adhat vissza — több lehetséges kulcsot is kipróbálunk,
// hogy ne dőljön el a funkció, ha a search-utils.mjs válasz-alakja kicsit más.
function normalizeImageResult(raw) {
  if (!raw) return null;
  const url = raw.url || raw.imageUrl || raw.image || raw.link || raw.src;
  if (!url) return null;
  const title = raw.title || raw.alt || raw.name || "Kép";
  const source = raw.source || raw.sourceName || "";
  const sourceUrl = raw.sourceUrl || raw.pageUrl || raw.link || "";
  return { url, title, source, sourceUrl };
}

async function findImage(message, lang) {
  if (typeof imageSearch !== "function") return null;
  try {
    const result = await Promise.race([
      imageSearch(message.slice(0, 200), lang),
      new Promise(resolve => setTimeout(() => resolve(null), 4000))
    ]);
    return normalizeImageResult(result);
  } catch (e) {
    console.error("Image search error:", e);
    return null;
  }
}

// Markdown blokk, amit GARANTÁLTAN a válasz elejére teszünk — nem bízzuk a modellre.
function buildImageMarkdown(image) {
  if (!image) return "";
  const caption = image.source ? `${image.title} (Forrás: ${image.source})` : image.title;
  const lines = [`![${image.title}](${image.url})`, `*${caption}*`];
  if (image.sourceUrl) lines.push(`[Forrás megtekintése](${image.sourceUrl})`);
  return lines.join("\n") + "\n\n";
}

// GEMINI — ELSŐDLEGES
async function* geminiChunks(promptText, systemInstruction) {
  if (!geminiAi) throw new Error("Gemini nincs konfigurálva");
  const stream = await geminiAi.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    config: { systemInstruction, temperature: 0.4 }
  });
  for await (const chunk of stream) {
    const text = typeof chunk?.text === "function" ? chunk.text() : chunk?.text;
    if (text) yield text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }
}

// GROQ — TARTALÉK
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
  if (!apiKey) throw new Error("Groq nincs konfigurálva");

  const primaryModel = getEnv("GROQ_MODEL") || "llama3-70b-8192";
  const fallbackModel = "llama3-8b-8192";

  let resp = await requestGroqCompletion(apiKey, primaryModel, promptText, systemInstruction);
  if (!resp.ok && primaryModel !== fallbackModel) {
    resp = await requestGroqCompletion(apiKey, fallbackModel, promptText, systemInstruction);
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
        if (delta) yield delta.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      } catch {}
    }
  }
}

// ✅ ÚJ: generátor-wrapper, ami a kép markdownt GARANTÁLTAN a stream elejére teszi,
// mielőtt bármi az AI válaszából elindulna.
async function* prependImage(imageMarkdown, innerGenerator) {
  if (imageMarkdown) yield imageMarkdown;
  for await (const chunk of innerGenerator) {
    yield chunk;
  }
}

// FŐ HANDLER
export default async function handler(req) {
  if (req.method === "OPTIONS") return corsOptionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Nem engedélyezett metódus" }, 405);
  if (!hasGroq && !hasGemini) return jsonResponse({ error: "AI szolgáltatás nincs beállítva", code: "ai_unavailable" }, 503);

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
    console.error("Notes error:", e);
  }

  const lang = guessLang(message);

  let webContext = "";
  try {
    const searchResult = await Promise.race([
      webSearch(message.slice(0, 200), lang),
      new Promise(resolve => setTimeout(() => resolve(null), 4000))
    ]);
    if (searchResult?.summary) {
      webContext = `${searchResult.summary}\n\n(Forrás: ${searchResult.source})`;
    }
  } catch (e) {
    console.error("Web search error:", e);
  }

  // ✅ ÚJ: kép keresése, ha a kérdés erre utal
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
    imageContext: image ? `${image.title} — ${image.url}` : "",
    history
  });

  // Quota növelés (háttérben)
  incrementUsage(user?.id).catch(e => console.error("Quota error:", e));

  // GEMINI → GROQ tartalék
  try {
    if (hasGemini) {
      return textStreamResponse(prependImage(imageMarkdown, geminiChunks(promptText, systemInstruction)));
    }
  } catch (err) {
    console.error("Gemini hiba, Groq próba:", err?.message);
  }

  try {
    if (hasGroq) {
      const resp = await fetchGroqStream(promptText, systemInstruction);
      return textStreamResponse(prependImage(imageMarkdown, groqChunks(resp)));
    }
  } catch (err2) {
    console.error("Groq is sikertelen:", err2?.message);
  }

  return jsonResponse({ error: "AI szolgáltatás nem elérhető", code: "ai_unavailable" }, 503);
}
