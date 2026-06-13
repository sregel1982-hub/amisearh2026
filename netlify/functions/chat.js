// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// Végleges verzió – Vizualizáció szigorúan kezelve
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

// --- ENV ---
const getEnv = (key) => process.env[key];

const requiredEnv = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!getEnv(key)) console.error(`Hiányzó env: ${key}`);
}

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

// --- RESPONSES ---
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}

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
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "Access-Control-Allow-Origin": "*" },
  });
}

// --- HELPERS ---
function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

function detectLanguage(text = "") {
  return "hu"; // oktatási app miatt mindig magyar
}

// --- RENDSZERUTASÍTÁS – MAXIMÁLISAN SZIGORÚ ---
function buildSystemInstruction() {
  return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

**ABSZOLÚT SZABÁLYOK VIZUALIZÁCIÓRA (ezeket soha ne sértsd meg):**
- Ha a felhasználó bármilyen képet, ábrát, diagramot, grafikon, idővonalat, gondolattérképet vagy vizualizációt kér → **SOHA ne írj szöveges leírást, kép leírást, Mermaid kódot, graph TD-t, markmapot vagy bármilyen egyéb kódot**.
- **Kötelezően** írd bele a válaszodba pontosan ezt a sort egyedül egy sorban: **diagram_kell**
- Ezután maximum 1-2 mondatos magyarázatot írhatsz, mit szeretnél ábrázolni.
- Ne próbáld szöveggel elmagyarázni a képet vagy ábrát.
- Ha van feltöltött dokumentum vagy jegyzet → abból dolgozz először.
- Használj táblázatot és felsorolást a szöveges válaszokban.
- A válasz végén mindig legyen "## Forrásjegyzék" 3–6 tétellel.
`;
}

// --- JEGYZETEK ---
async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}\n\nFONTOS: Elsődlegesen ezt használd!`);

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
          if (text.length > 80) parts.push(`=== JEGYZET: \( {title} ===\n \){text}`);
        }
      }
    } catch (e) { console.error("Notes error:", e); }
  }

  return parts.join("\n\n");
}

// --- PROMPT ---
function buildPrompt({ message, notesContext, history }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = historyArray
    .map(item => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return [
    notesContext ? `## Dokumentumok és jegyzetek\n${notesContext}\n\n` : "",
    historyText ? `## Előzmények\n${historyText}\n\n` : "",
    `## Aktuális kérdés\n${message}`,
  ].filter(Boolean).join("");
}

function needsDiagram(message) {
  const m = message.toLowerCase();
  return ["diagram", "grafikon", "ábra", "idővonal", "chart", "oszlop", "vonal", "kördiagram", "vizualizáció", "kép", "rajzolj", "ábrázol", "tutaj"].some(k => m.includes(k));
}

// --- DIAGRAM MENTÉS ---
async function saveDiagram(userId, question, config, explanation) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("charts")
      .insert({ user_id: userId, question, config, explanation: explanation || "" })
      .select("id")
      .single();
    return error ? null : data?.id || null;
  } catch (err) {
    console.error("Save diagram error:", err);
    return null;
  }
}

// --- MAIN HANDLER ---
export default async function handler(req) {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }});
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Jelentkezz be!" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) return jsonResponse({ error: "Hiányzó üzenet." }, 400);

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const promptText = buildPrompt({ message, notesContext, history: body.history || [] });

    if (needsDiagram(message) && body.chartConfig) {
      const id = await saveDiagram(user.id, message, body.chartConfig, body.explanation);
      if (id) return jsonResponse({ redirect: `https://amisearch.org/diagram?id=${id}` });
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      systemInstruction: buildSystemInstruction(),
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 }, // alacsonyabb temperature = következetesebb
    });

    async function* generator() {
      for await (const chunk of stream) {
        const text = chunk?.text || chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) yield text;
      }
    }

    return textStreamResponse(generator());

  } catch (error) {
    console.error("Chat AI fatal error:", error);
    return jsonResponse({ error: "Szerver hiba történt. Próbáld újra később." }, 500);
  }
}
