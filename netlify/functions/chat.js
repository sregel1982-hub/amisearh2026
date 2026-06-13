// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// Teljesen új, hibamentes verzió
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

// --- ENV KEZELÉS ---
const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

// --- JSON RESPONSE ---
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// --- STREAM RESPONSE ---
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
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// --- SUPABASE ADMIN ---
function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// --- SZÖVEG TISZTÍTÁS ---
function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/
/g, "
")
    .replace(/[ \t]+/g, " ")
    .replace(/
{4,}/g, "

")
    .trim()
    .slice(0, max);
}

// --- NYELVDETEKTÁLÁS ---
function detectLanguage(text = "") {
  const sample = String(text || "").toLowerCase();

  if (/[áéíóöőúüű]/.test(sample)) return "hu";
  if (["hogy", "mert", "szerint", "magyarázd", "feladat", "rajzold", "mi az"].some((w) => sample.includes(w))) return "hu";

  return "hu";
}

// --- RENDSZERUTASÍTÁS ---
function buildSystemInstruction(lang = "hu") {
  if (lang === "hu") {
    return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

SZABÁLYOK:
- Ha van feltöltött dokumentum → ELŐSZÖR abból dolgozz.
- Ne írj felesleges bevezetést.
- Használj táblázatot, felsorolást, ha egyszerű.
- Ha a feladat bonyolult DIAGRAM vagy GRAFIKON → csak jelezd: "diagram_kell".
- A válasz végén legyen "## Forrásjegyzék" 3–6 tétellel.
`;
  }

  return "You are the AMISEARCH educational assistant. Answer clearly and concisely.";
}

// --- JEGYZETEK BETÖLTÉSE ---
async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const supabase = getSupabaseAdmin();

  const inline = cleanText(inlineNotes, 30000);
  if (inline) {
    parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===
${inline}

FONTOS: Használd ezt elsődlegesen!`);
  }

  if (!supabase || !user?.id) {
    return parts.join("

");
  }

  try {
    const { data } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, text_content, processed, created_at")
      .eq("user_id", user.id)
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (Array.isArray(data)) {
      for (const note of data) {
        const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
        const text = cleanText(note.text_content, 15000);

        if (text && text.length > 50) {
          parts.push(`=== JEGYZET: ${title} ===
${text}`);
        }
      }
    }
  } catch {}

  return parts.join("

");
}

// --- PROMPT ÉPÍTŐ ---
function buildPrompt({ message, notesContext, history }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];

  const historyText = historyArray
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .join("
");

  return [
    notesContext ? `## Dokumentumok
${notesContext}

` : "",
    historyText ? `## Előzmények
${historyText}

` : "",
    `## Kérdés
${message}`,
  ]
    .filter(Boolean)
    .join("");
}

// --- DIAGRAM FELISMERÉS ---
function needsDiagram(message) {
  const m = message.toLowerCase();
  return [
    "diagram",
    "grafikon",
    "oszlopdiagram",
    "vonaldiagram",
    "kördiagram",
    "chart",
    "chart.js",
    "adatpont",
    "statisztika",
  ].some((k) => m.includes(k));
}

// --- DIAGRAM MENTÉS SUPABASE-BE ---
async function saveDiagram(userId, question, config, explanation) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
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

    if (error) return null;
    return data.id;
  } catch {
    return null;
  }
}

// --- FŐ HANDLER ---
export default async function handler(req) {
  try {
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
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    if (!getEnv("GEMINI_API_KEY")) {
      return jsonResponse({ error: "Az AI szolgáltatás jelenleg nem elérhető." }, 503);
    }

    const user = await getSupabaseUser(req);
    if (!user) {
      return jsonResponse({ error: "Jelentkezz be!" }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) {
      return jsonResponse({ error: "Hiányzó üzenet." }, 400);
    }

    let lang = body.lang && body.lang !== "auto" ? body.lang : detectLanguage(rawMessage);
    if (lang !== "hu" && /[áéíóöőúüű]/i.test(rawMessage)) {
      lang = "hu";
    }

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const promptText = buildPrompt({
      message,
      notesContext,
      history: body.history || [],
    });

    const diagramRequested = needsDiagram(message);

    if (diagramRequested) {
      const diagramConfig = body.chartConfig || null;

      if (diagramConfig) {
        const id = await saveDiagram(
          user.id,
          message,
          diagramConfig,
          body.explanation || "Diagram magyarázat"
        );

        if (id) {
          return jsonResponse({ redirect: `https://amisearch.org/diagram?id=${id}` });
        }
      }
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      config: {
        temperature: 0.35,
        systemInstruction: buildSystemInstruction(lang),
      },
    });

    async function* generator() {
      for await (const chunk of stream) {
        const text =
          chunk?.text ||
          chunk?.candidates?.[0]?.content?.parts?.[0]?.text ||
          "";
        if (text) yield text;
      }
    }

    return textStreamResponse(generator());
  } catch (error) {
    console.error("Chat AI error:", error?.message || error);
    return jsonResponse({ error: error?.message || "Szerver hiba" }, 500);
  }
}
