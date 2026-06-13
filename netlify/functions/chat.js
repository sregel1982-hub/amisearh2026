// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// Javított, optimalizált verzió
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

// --- ENV KEZELÉS ---
const getEnv = (key) => process.env[key];

const requiredEnv = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!getEnv(key)) {
    console.error(`Hiányzó környezeti változó: ${key}`);
  }
}

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
        console.error("Stream error:", err);
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
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

// --- NYELVDETEKTÁLÁS ---
function detectLanguage(text = "") {
  const sample = String(text || "").toLowerCase();

  if (/[áéíóöőúüű]/i.test(sample)) return "hu";
  if (["hogy", "mert", "szerint", "magyarázd", "feladat", "rajzold", "mi az"].some((w) => sample.includes(w))) {
    return "hu";
  }

  return "hu"; // alapértelmezett az oktatási app miatt
}

// --- RENDSZERUTASÍTÁS ---
function buildSystemInstruction(lang = "hu") {
  if (lang === "hu") {
    return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

SZABÁLYOK:
- Ha van feltöltött dokumentum vagy jegyzet → ELŐSZÖR abból dolgozz.
- Ne írj felesleges bevezetést vagy udvariassági frázisokat.
- Használj táblázatot vagy felsorolást, ahol az áttekinthetőbb.
- Ha diagram/grafikon kell → írd bele a válaszba: "diagram_kell".
- A válasz végén mindig legyen "## Forrásjegyzék" 3–6 releváns tétellel.
`;
  }
  return "You are the AMISEARCH educational assistant. Answer clearly, concisely and helpfully.";
}

// --- JEGYZETEK BETÖLTÉSE (optimalizált) ---
async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const supabase = getSupabaseAdmin();

  // Feltöltött inline jegyzet
  const inline = cleanText(inlineNotes, 30000);
  if (inline) {
    parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}\n\nFONTOS: Elsődlegesen ezt használd!`);
  }

  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("cim, original_name, text_content, created_at")
      .eq("user_id", user.id)
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(6); // csökkentve a token fogyasztás miatt

    if (error) console.error("Supabase query error:", error.message);

    if (Array.isArray(data)) {
      for (const note of data) {
        const title = note.cim || note.original_name || "Jegyzet";
        const text = cleanText(note.text_content, 12000);

        if (text && text.length > 80) {
          parts.push(`=== JEGYZET: \( {title} ===\n \){text}`);
        }
      }
    }
  } catch (err) {
    console.error("Notes load error:", err?.message || err);
  }

  return parts.join("\n\n");
}

// --- PROMPT ÉPÍTŐ ---
function buildPrompt({ message, notesContext, history }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];

  const historyText = historyArray
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return [
    notesContext ? `## Dokumentumok és jegyzetek\n${notesContext}\n\n` : "",
    historyText ? `## Előzmények\n${historyText}\n\n` : "",
    `## Aktuális kérdés\n${message}`,
  ].filter(Boolean).join("");
}

// --- DIAGRAM FELISMERÉS ---
function needsDiagram(message) {
  const m = message.toLowerCase();
  return [
    "diagram", "grafikon", "oszlopdiagram", "vonaldiagram", "kördiagram",
    "chart", "chart.js", "adatvizualizáció", "statisztika"
  ].some((k) => m.includes(k));
}

// --- DIAGRAM MENTÉS ---
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
        explanation: explanation || "Diagram magyarázat",
      })
      .select("id")
      .single();

    return error ? null : data?.id || null;
  } catch (err) {
    console.error("Save diagram error:", err);
    return null;
  }
}

// --- FŐ HANDLER ---
export default async function handler(req) {
  try {
    // CORS preflight
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

    // Felhasználó azonosítás
    let user;
    try {
      user = await getSupabaseUser(req);
    } catch (authErr) {
      console.error("Auth error:", authErr);
      return jsonResponse({ error: "Hitelesítési hiba. Jelentkezz be újra!" }, 401);
    }

    if (!user) {
      return jsonResponse({ error: "Jelentkezz be!" }, 401);
    }

    // Body parse
    let body;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Érvénytelen JSON formátum." }, 400);
    }

    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) {
      return jsonResponse({ error: "Hiányzó üzenet." }, 400);
    }

    // Nyelv detektálás
    let lang = body.lang && body.lang !== "auto" ? body.lang : detectLanguage(rawMessage);

    // Jegyzetek betöltése
    const notesContext = await loadUserNotesContext(user, body.notes || "");

    // Prompt építés
    const promptText = buildPrompt({
      message,
      notesContext,
      history: body.history || [],
    });

    // Diagram kérés kezelése
    if (needsDiagram(message) && body.chartConfig) {
      const id = await saveDiagram(
        user.id,
        message,
        body.chartConfig,
        body.explanation
      );

      if (id) {
        return jsonResponse({ redirect: `https://amisearch.org/diagram?id=${id}` });
      }
    }

    // AI hívás (javított SDK szerint)
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      systemInstruction: buildSystemInstruction(lang),
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192,
      },
    });

    // Stream válasz
    async function* generator() {
      for await (const chunk of stream) {
        const text = chunk?.text ||
                     chunk?.candidates?.[0]?.content?.parts?.[0]?.text ||
                     "";
        if (text) yield text;
      }
    }

    return textStreamResponse(generator());

  } catch (error) {
    console.error("Chat AI fatal error:", error);
    return jsonResponse({ error: "Szerver hiba történt. Próbáld újra később." }, 500);
  }
}
