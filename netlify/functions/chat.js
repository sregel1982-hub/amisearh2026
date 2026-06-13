// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// Teljesen új, javított verzió
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

// --- ENV KEZELÉS ---
const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

// --- SUPABASE ADMIN ---
function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- SEGÉDFÜGGVÉNYEK ---
function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function jsonError(message, status = 500, code = "error") {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function aiUnavailableResponse() {
  return jsonError("Az AI szolgáltatás jelenleg nem elérhető.", 503, "ai_unavailable");
}

function isAiConfigured() {
  return !!getEnv("GEMINI_API_KEY");
}

// ===============================
// NYELVDETEKTÁLÁS – JAVÍTOTT
// ===============================
function detectLanguage(text = "") {
  const sample = String(text || "").toLowerCase();

  // Magyar ékezet → 100% magyar
  if (/[áéíóöőúüű]/.test(sample)) return "hu";

  // Gyakori magyar szavak
  const huWords = ["hogy", "mert", "szerint", "magyarázd", "feladat", "rajzold", "mi az"];
  if (huWords.some((w) => sample.includes(w))) return "hu";

  // Idegen nyelvek
  const es = ["¿", "¡", "ñ", "qué", "cómo", "porque"];
  const de = ["ä", "ö", "ü", "ß", "wie", "was", "weil"];
  const fr = ["à", "è", "é", "ê", "ç", "comment", "pourquoi"];

  if (es.some((m) => sample.includes(m))) return "es";
  if (de.some((m) => sample.includes(m))) return "de";
  if (fr.some((m) => sample.includes(m))) return "fr";

  // Alapértelmezés: MAGYAR
  return "hu";
}

// ===============================
// RENDSZERUTASÍTÁS – JAVÍTOTT
// ===============================
function buildSystemInstruction(lang = "hu") {
  const instructions = {
    hu: `
Te az AMISEARCH oktatási asszisztense vagy. Mindig MAGYARUL válaszolj.

SZABÁLYOK:
- Ha van feltöltött dokumentum → ELŐSZÖR abból dolgozz.
- Ne írj felesleges bevezetést.
- Használj táblázatot, felsorolást, ASCII ábrát, ha egyszerű.
- Ha a feladat bonyolult DIAGRAM vagy GRAFIKON → csak jelezd: "diagram_kell".
- A rendszer majd átirányít a /diagram oldalra.
- A válasz végén legyen "## Forrásjegyzék" 3–6 tétellel.
`,

    es: `Eres el asistente educativo de AMISEARCH. Responde en español.`,
    de: `Du bist der AMISEARCH Bildungsassistent. Antworte auf Deutsch.`,
    fr: `Vous êtes l'assistant éducatif AMISEARCH. Répondez en français.`,
    en: `You are the AMISEARCH educational assistant. Answer in English.`,
  };

  return instructions[lang] || instructions["hu"];
}
// ===============================
// FÁJL LETÖLTÉS SUPABASE STORAGE-BÓL
// ===============================
async function downloadFileAsBase64(supabase, filePath, bucket = "jegyzetek") {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) return null;

    const arrayBuffer = await data.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    let mimeType = "application/octet-stream";
    if (filePath.endsWith(".pdf")) mimeType = "application/pdf";
    else if (filePath.endsWith(".png")) mimeType = "image/png";
    else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) mimeType = "image/jpeg";

    return { base64, mimeType };
  } catch {
    return null;
  }
}

// ===============================
// JEGYZETEK BETÖLTÉSE (szöveg + kép)
// ===============================
async function loadUserNotesContext(user, query, inlineNotes = "") {
  const parts = [];
  const images = [];

  const inline = cleanText(inlineNotes, 30000);
  if (inline) {
    parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}\n\nFONTOS: Használd ezt elsődlegesen!`);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return { text: parts.join("\n\n"), images };

  try {
    const { data } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, text_content, file_path, processed, created_at")
      .eq("user_id", user.id)
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (Array.isArray(data)) {
      for (const note of data) {
        const text = cleanText(note.text_content, 20000);
        const title = note.cim || note.original_name || `Jegyzet #${note.id}`;

        if (text && text.length > 50) {
          parts.push(`=== Mentett jegyzet: ${title} ===\n${text}`);
        } else if (note.file_path) {
          const fileData = await downloadFileAsBase64(supabase, note.file_path);
          if (fileData) {
            images.push({
              title,
              base64: fileData.base64,
              mimeType: fileData.mimeType,
            });
            parts.push(`=== Mentett jegyzet (kép): ${title} ===\n[A dokumentum képként lett feltöltve.]`);
          }
        }
      }
    }
  } catch {}

  return { text: parts.join("\n\n"), images };
}

// ===============================
// PROMPT ÉPÍTŐ
// ===============================
function buildPrompt({ message, notesContext, history }) {
  const historyText = history
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return `
${notesContext ? `## Dokumentumok\n${notesContext}\n\n` : ""}
${historyText ? `## Előzmények\n${historyText}\n\n` : ""}
## Kérdés
${message}
`;
}

// ===============================
// DIAGRAM FELISMERÉS
// ===============================
function needsDiagram(message) {
  const m = message.toLowerCase();
  const keywords = [
    "diagram",
    "grafikon",
    "oszlopdiagram",
    "vonaldiagram",
    "kördiagram",
    "chart",
    "chart.js",
    "adatpont",
    "statisztika",
    "eloszlás",
    "idősor",
  ];
  return keywords.some((k) => m.includes(k));
}
// ===============================
// STREAM SEGÉD
// ===============================
async function* streamToGenerator(stream) {
  for await (const chunk of stream) {
    const text =
      chunk?.text ||
      chunk?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "";
    if (text) yield text;
  }
}

function streamResponse(generator) {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ===============================
// DIAGRAM MENTÉS SUPABASE-BE
// ===============================
async function saveDiagramToSupabase(userId, question, config, explanation) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("charts")
    .insert({
      user_id: userId,
      question,
      config,
      explanation,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Diagram mentési hiba:", error.message);
    return null;
  }

  return data.id;
}

// ===============================
// FŐ HANDLER
// ===============================
export default async function handler(req) {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405, "method_not_allowed");
    }

    if (!isAiConfigured()) {
      return aiUnavailableResponse();
    }

    // FELHASZNÁLÓ
    const user = await getSupabaseUser(req);
    if (!user) {
      return jsonError("Jelentkezz be!", 401, "unauthorized");
    }

    // BODY
    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) {
      return jsonError("Hiányzó üzenet.", 400, "missing_message");
    }

    // NYELV
    let lang =
      body.lang && body.lang !== "auto"
        ? body.lang
        : detectLanguage(rawMessage);

    if (lang !== "hu" && /[áéíóöőúüű]/i.test(rawMessage)) {
      lang = "hu";
    }

    const history = Array.isArray(body.history)
      ? body.history.slice(-8)
      : [];

    // JEGYZETEK
    const notesResult = await loadUserNotesContext(
      user,
      message,
      body.notes || ""
    );
    const notesContext = notesResult.text;
    const noteImages = notesResult.images;

    // PROMPT
    const promptText = buildPrompt({
      message,
      notesContext,
      history,
    });

    // DIAGRAM FELISMERÉS
    const diagramRequested = needsDiagram(message);

    // GEMINI CONTENTS
    const parts = [{ text: promptText }];

    for (const img of noteImages.slice(0, 3)) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.base64,
        },
      });
    }

    // GEMINI STREAM
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.35,
        systemInstruction: buildSystemInstruction(lang),
      },
    });

    // HA DIAGRAM KELL → MENTÉS + LINK
    if (diagramRequested) {
      const diagramConfig = body.chartConfig || null;
      const explanation = body.explanation || "Diagram magyarázat";

      if (diagramConfig) {
        const id = await saveDiagramToSupabase(
          user.id,
          message,
          diagramConfig,
          explanation
        );

        if (id) {
          return new Response(
            JSON.stringify({
              redirect: `https://amisearch.org/diagram?id=${id}`,
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
            }
          );
        }
      }
    }

    // STREAM VISSZA
    return streamResponse(streamToGenerator(stream));
  } catch (error) {
    console.error("Chat AI error:", error?.message || error);
    return aiUnavailableResponse();
  }
}
