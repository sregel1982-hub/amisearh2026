// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// JAVÍTOTT VERZIÓ – diagram generálás Chart.js configgal
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

function corsOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
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
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
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
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, max);
}

// Próbálja kiszedni az első { ... } JSON objektumot egy szövegből,
// még akkor is, ha a modell ```json blokkba csomagolta vagy egyéb szöveget tett elé/mögé.
function extractJsonObject(text) {
  if (!text) return null;
  let cleaned = String(text).trim();

  // ```json ... ``` vagy ``` ... ``` blokkok eltávolítása
  cleaned = cleaned.replace(/```json/gi, "```").trim();
  if (cleaned.startsWith("```")) {
    const firstFence = cleaned.indexOf("```");
    const lastFence = cleaned.lastIndexOf("```");
    if (lastFence > firstFence) {
      cleaned = cleaned.slice(firstFence + 3, lastFence).trim();
    }
  }

  // Ha közvetlenül parse-olható, kész
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // folytatjuk a tisztítást
  }

  // Az első '{' és az utolsó '}' közötti rész kivágása
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (_) {
    return null;
  }
}

// --- RENDSZERUTASÍTÁS – normál szöveges válaszhoz (NINCS diagram_kell jelző) ---
function buildSystemInstructionText() {
  return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

- Adj pontos, jól strukturált, oktatási célú válaszokat.
- Ha hasznos, használj táblázatot és felsorolást.
- Ne generálj diagramot, ábrát vagy vizualizációt szövegesen (azt a rendszer külön kezeli).
- A válasz végén legyen "## Forrásjegyzék".
`;
}

// --- RENDSZERUTASÍTÁS – diagram generáláshoz (csak JSON választ várunk) ---
function buildChartSystemInstruction() {
  return `
Te egy adatvizualizációs asszisztens vagy. A bemenet egy magyar nyelvű oktatási kérdés (és opcionálisan kontextus jegyzetek/előzmények).

A FELADATOD: készíts egy Chart.js kompatibilis konfigurációt, ami a kérdésben szereplő adatokat/folyamatot/összefüggést jól ábrázolja.

KIMENETI FORMÁTUM – KIZÁRÓLAG egy érvényes JSON objektum, semmi más (nincs markdown, nincs magyarázó szöveg a JSON előtt/után):
{
  "config": {
    "type": "bar" | "line" | "pie" | "doughnut" | "radar" | "scatter",
    "data": {
      "labels": [...],
      "datasets": [ { "label": "...", "data": [...], ... } ]
    },
    "options": { ... }
  },
  "explanation": "Rövid, magyar nyelvű magyarázat a diagramról (2-4 mondat)."
}

Szabályok:
- A "config" objektumnak közvetlenül a Chart.js "new Chart(ctx, config)" hívásba behelyettesíthetőnek kell lennie.
- Ha pontos számadat nincs megadva, adj becsült, realisztikus értékeket, és az "explanation"-ben jelezd, hogy becslés.
- Ne használj függvényeket, kommenteket vagy bármilyen nem-JSON elemet a konfigurációban.
- A válasz csak a JSON objektum legyen, kódblokk-jelölés (\`\`\`) nélkül.
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
          if (text.length > 80) parts.push(`=== JEGYZET: ${title} ===\n${text}`);
        }
      }
    } catch (e) {
      console.error("Notes error:", e);
    }
  }
  return parts.join("\n\n");
}

// --- PROMPT BUILDER ---
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

function needsVisualization(message) {
  const m = message.toLowerCase();
  return /diagram|grafikon|oszlopdiagram|vonaldiagram|kördiagram|chart|vizualizáció|tutaj|idővonal/.test(m);
}

// Valódi kép/fotó/illusztráció kérése (nem diagram!)
function needsImageSearch(message) {
  const m = message.toLowerCase();
  return /fénykép|fotó|illusztráci|hogy néz ki|hogy nézett ki|mutass (egy )?képet|képet (mutat|kér)|nézzünk meg egy képet|képen/.test(m);
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

// Rövid, angol keresőkifejezés kinyerése a Commons kereséshez
async function extractImageSearchQuery(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Adj vissza egy rövid (1-4 szavas) ANGOL keresési kifejezést a Wikimedia Commons képkereséséhez, ami a következő kérdéshez illő fényképet/illusztrációt találja meg. Csak a kifejezést írd vissza, idézőjel és magyarázat nélkül.\n\nKérdés: "${message}"`
        }],
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 30 },
    });
    const text = result?.text || result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = cleanText(text, 100).replace(/["'`]/g, "");
    return cleaned || message.slice(0, 60);
  } catch (err) {
    console.error("Image query extraction error:", err);
    return message.slice(0, 60);
  }
}

// Wikimedia Commons keresés és az első valódi kép kiválasztása
async function searchCommonsImage(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=800&format=json&origin=*`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;

    // Rendezzük az index szerint, hogy a legjobb találat legyen elöl
    const ordered = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0));

    for (const page of ordered) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || "";
      if (!mime.startsWith("image/")) continue; // videó/hang/pdf kihagyása

      const meta = info.extmetadata || {};
      return {
        url: info.thumburl || info.url,
        fullUrl: info.url,
        title: String(page.title || "").replace(/^File:/, ""),
        artist: stripHtml(meta.Artist?.value),
        license: stripHtml(meta.LicenseShortName?.value),
        licenseUrl: meta.LicenseUrl?.value || "",
        description: stripHtml(meta.ImageDescription?.value).slice(0, 500),
        sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      };
    }
    return null;
  } catch (err) {
    console.error("Commons search error:", err);
    return null;
  }
}

// --- DIAGRAM SAVE ---
async function saveDiagram(userId, question, config, explanation) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("charts")
      .insert({
        user_id: userId,
        question,
        // A config objektumot stringként mentjük el, mert nem ismert, hogy a
        // 'config' oszlop JSONB vagy text típusú-e. A diagram.html mindkét
        // esetet kezeli (JSON.parse, ha string-ként jön vissza).
        config: JSON.stringify(config),
        explanation: explanation || "Vizualizáció",
      })
      .select("id")
      .single();
    return error ? null : data?.id || null;
  } catch (err) {
    console.error("Save diagram error:", err);
    return null;
  }
}

// --- HANDLER ---
export default async function handler(req) {
  try {
    if (req.method === "OPTIONS") return corsOptionsResponse();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Jelentkezz be!" }, 401);

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) return jsonResponse({ error: "Hiányzó üzenet." }, 400);

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const promptText = buildPrompt({ message, notesContext, history: body.history || [] });

    // --- DIAGRAM ÁG ---
    if (needsVisualization(message)) {
      const chartPrompt = `${promptText}\n\nKészíts a fenti kérdéshez Chart.js konfigurációt a megadott formátum szerint.`;

      let chartResultText = "";
      try {
        const chartResult = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [{ role: "user", parts: [{ text: chartPrompt }] }],
          systemInstruction: buildChartSystemInstruction(),
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json",
          },
        });
        chartResultText = chartResult?.text
          || chartResult?.candidates?.[0]?.content?.parts?.[0]?.text
          || "";
      } catch (e) {
        console.error("Chart generation error:", e);
        return jsonResponse({ error: "Nem sikerült a diagramot legenerálni." }, 500);
      }

      const parsed = extractJsonObject(chartResultText);

      if (!parsed || !parsed.config || !parsed.config.type) {
        console.error("Invalid chart JSON:", chartResultText);
        return jsonResponse({ error: "A diagram generálása sikertelen volt, próbáld újrafogalmazni a kérdést." }, 500);
      }

      const id = await saveDiagram(user.id, message, parsed.config, parsed.explanation);
      if (!id) return jsonResponse({ error: "A diagram mentése sikertelen volt." }, 500);

      return jsonResponse({ redirect: `https://amisearch.org/diagram?id=${id}` });
    }

    // --- KÉP/FOTÓ KERESÉS ÁG (Wikimedia Commons) ---
    if (needsImageSearch(message)) {
      const searchQuery = await extractImageSearchQuery(message);
      const image = await searchCommonsImage(searchQuery);

      if (!image) {
        return jsonResponse({ error: "Nem található kép a témához." }, 404);
      }

      return jsonResponse({
        type: "image",
        question: message,
        image: {
          url: image.url,
          fullUrl: image.fullUrl,
          title: image.title,
          artist: image.artist,
          license: image.license,
          licenseUrl: image.licenseUrl,
          description: image.description,
          sourcePage: image.sourcePage,
        },
      });
    }

    // --- NORMÁL SZÖVEGES VÁLASZ ---
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      systemInstruction: buildSystemInstructionText(),
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2048,
      },
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
    return jsonResponse({ error: "Szerver hiba történt." }, 500);
  }
}
