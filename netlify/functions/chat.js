// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// MERMAID + KÉPKERESÉS VERZIÓ (egységes szöveges stream)
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

// Egyetlen szöveges darab streamként visszaadása (kép-eredményhez)
function singleChunkStream(text) {
  async function* gen() {
    yield text;
  }
  return textStreamResponse(gen());
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

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

// --- RENDSZERUTASÍTÁS ---
function buildSystemInstructionText() {
  return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

- Adj pontos, jól strukturált, oktatási célú válaszokat.
- Ha hasznos, használj táblázatot és felsorolást.

DIAGRAM / ÁBRA / IDŐVONAL / FOLYAMATÁBRA KÉRÉSEKOR:
- Ha a felhasználó diagramot, ábrát, folyamatábrát, idővonalat vagy vizualizációt kér, és ez Mermaid diagrammal ábrázolható (pl. flowchart, idővonal, sequence diagram, mindmap, pie chart), írj egy rövid (1-3 mondatos) magyar magyarázatot, majd illessz be UTÁNA egy érvényes Mermaid kódblokkot, pontosan így:

\`\`\`mermaid
flowchart TD
    A[Példa] --> B[Másik elem]
\`\`\`

- A Mermaid kódblokk szintaxisa legyen helyes (flowchart TD/LR, timeline, mindmap, pie, sequenceDiagram stb. közül a kérdéshez legjobban illőt válaszd).
- Számszerű adatok ábrázolásához használj "pie" típust vagy "xychart-beta" típust, ha van rá adat; ha nincs pontos adat, jelezd, hogy becslés.
- Soha ne mondd, hogy "nem tudok képet/diagramot készíteni" – mindig próbálj Mermaid kódblokkot adni, ha a kérés vizualizációra vonatkozik.
- Tilos JSON-t, kép-leírást vagy "image_description" mezőt írni a válaszba.

A válasz végén legyen "## Forrásjegyzék".
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

// Valódi kép/fotó/illusztráció kérése (nem diagram!)
function needsImageSearch(message) {
  const m = message.toLowerCase();
  return /fénykép|fotó|illusztráci|hogy néz ki|hogy nézett ki|mutass (egy )?képet|képet (mutat|kér)|nézzünk meg egy képet|képen/.test(m);
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

    const ordered = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0));

    for (const page of ordered) {
      const info = page?.imageinfo?.[0];
      if (!info) continue;

      const mime = info.mime || "";
      if (!mime.startsWith("image/")) continue; // videó/hang/pdf kihagyása

      const meta = info.extmetadata || {};
      return {
        url: info.thumburl || info.url,
        title: String(page.title || "").replace(/^File:/, ""),
        artist: stripHtml(meta.Artist?.value),
        license: stripHtml(meta.LicenseShortName?.value),
        sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      };
    }
    return null;
  } catch (err) {
    console.error("Commons search error:", err);
    return null;
  }
}

// Markdown szöveg összeállítása a kép-eredményből (a meglévő marked+CSS rendereli)
function buildImageMarkdown(image, message) {
  const altText = (image.title || message || "Kép").replace(/[\[\]]/g, "");
  const lines = [];

  lines.push(`![${altText}](${image.url})`);
  lines.push("");

  const attributionParts = [];
  if (image.title) attributionParts.push(`**${image.title}**`);
  if (image.artist) attributionParts.push(`Szerző: ${image.artist}`);
  if (image.license) attributionParts.push(`Licenc: ${image.license}`);

  if (attributionParts.length) {
    lines.push(attributionParts.join(" — "));
  }

  if (image.sourcePage) {
    lines.push(`Forrás: [Wikimedia Commons](${image.sourcePage})`);
  }

  lines.push("");
  lines.push("## Forrásjegyzék");
  lines.push("- Wikimedia Commons");

  return lines.join("\n");
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

    // --- KÉP/FOTÓ KERESÉS ÁG (Wikimedia Commons) – markdown szövegként streamelve ---
    if (needsImageSearch(message)) {
      const searchQuery = await extractImageSearchQuery(message);
      const image = await searchCommonsImage(searchQuery);

      if (!image) {
        return singleChunkStream("Sajnálom, nem találtam megfelelő képet ehhez a témához a Wikimedia Commons-on. Próbáld másképp megfogalmazni a kérdést.");
      }

      return singleChunkStream(buildImageMarkdown(image, message));
    }

    // --- NORMÁL SZÖVEGES VÁLASZ (ide tartozik a diagram/Mermaid is) ---
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
