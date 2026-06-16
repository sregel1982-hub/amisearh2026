// ===============================
// AMISEARCH 2026 – CHAT ENGINE (MULTIMODAL)
// STRUKTURÁLT MINDMAP + CHART.JS JSON + KÉPKERESÉS + AUTO-REDIRECTS
// ===============================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) => process.env[key];

const requiredEnv = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
for (const key of requiredEnv) {
  if (!getEnv(key)) console.error(`Hiányzó env: ${key}`);
}

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      "Content-Type": "application/json; charset=utf-8", 
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
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

function singleChunkStream(text) {
  async function* gen() { yield text; }
  return textStreamResponse(gen());
}

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

function buildSystemInstructionText() {
  return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.
- Adj pontos, jól strukturált, oktatási célú válaszokat.
- Ha hasznos, használj táblázatot és felsorolást.

JEGYZETEK HASZNÁLATA:
- A feltöltött jegyzetek és előzmények csak KIEGÉSZÍTŐ kontextusként szolgálnak. Szabadon használd az általános tudásodat is.

VIZUALIZÁCIÓS ÉS ÁTIRÁNYÍTÁSI SZABÁLYOK (MANDATORY):

1. HA FOLYAMATOT, STRUKTÚRÁT, FOGALMI ÖSSZEFÜGGÉST VAGY GONDOLATTÉRKÉPET KÉRNEK:
   - Írj egy rövid magyarázatot, majd illessz be egy Mermaid MINDMAP kódblokkot:
   \`\`\`mermaid
   mindmap
     root((Téma neve))
       Főág 1
         Alág 1
       Főág 2
   \`\`\`
   - Tilos flowchart, xychart-beta vagy pie típusú Mermaidot használni!

2. HA SZÁMSZERŰ ADATOKAT, STATISZTIKÁT, IDŐBELI VÁLTOZÁST VAGY GRAFIKONT KÉRNEK (pl. lakosság, GDP, hőmérséklet):
   - Írj egy rövid magyar összefoglalót, majd tegyél be egy tiszta, érvényes Chart.js konfigurációt egy \`\`\`json-chart kódblokkba.
   - Ne használj benne JavaScript függvényeket, csak tiszta JSON-t (type, data, options).
   - Példa formátum:
   \`\`\`json-chart
   {
     "type": "line",
     "data": {
       "labels": ["1990", "2000", "2010", "2020", "2023"],
       "datasets": [{
         "label": "Magyarország népessége (millió fő)",
         "data": [10.4, 10.2, 10.0, 9.7, 9.6],
         "borderColor": "#6366f1",
         "backgroundColor": "rgba(99, 102, 241, 0.1)",
         "tension": 0.2
       }]
     }
   }
   \`\`\`

3. DINAMIKUS REDIRECT (ÁTIRÁNYÍTÁS) KÓD GENERÁLÁSA:
   Ha a felhasználó interaktív geometriai ábrát, molekulát vagy kvízt kér, a válaszod legvégén, egy különálló sorban kötelező elhelyezned a megfelelő redirect címkét!
   - Deltoid esetén: [REDIRECT:graph:geometry:deltoid]
   - Egyenlő szárú háromszög esetén: [REDIRECT:graph:geometry:triangle]
   - Paralelogramma esetén: [REDIRECT:graph:geometry:parallelogram]
   - Szabályos hatszög esetén: [REDIRECT:graph:geometry:hexagon]
   - Só rács (NaCl) / Sómolekula esetén: [REDIRECT:graph:molecule:nacl]
   - Víz (H2O) esetén: [REDIRECT:graph:molecule:h2o]
   - Szén-dioxid (CO2) esetén: [REDIRECT:graph:molecule:co2]
   - Metán (CH4) esetén: [REDIRECT:graph:molecule:ch4]
   - Kvíz (bármelyik teszt felület) esetén: [REDIRECT:quiz]

A válasz végén legyen "## Forrásjegyzék".
`;
}

async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}`);

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

async function classifyRequest(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Döntsd el, hogy a kérés VALÓDI FÉNYKÉPET vagy ILLUSZTRÁCIÓT kér konkrét személyről, tárgyról, állatról (pl. "kép", "fotó", "mutass egy képet X-ről"), vagy MAGYARÁZATOT, DIAGRAMOT, ADATOT kér.
Válaszolj KIZÁRÓLAG ebben a formátumban:
TIPUS: IMAGE vagy TEXT
KERESES: <angol kifejezés ha IMAGE, különben ->
Kérdés: "${message}"`
        }],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 40 },
    });

    const text = result?.text || result?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const typeMatch = text.match(/T[ÍI]PUS:\s*(IMAGE|TEXT)/i);
    const searchMatch = text.match(/KERES[ÉE]S:\s*(.+)/i);

    const type = typeMatch ? typeMatch[1].toUpperCase() : "TEXT";
    let searchQuery = searchMatch ? searchMatch[1].trim() : "";
    if (searchQuery === "-" || !searchQuery) searchQuery = message.slice(0, 60);

    return { type, searchQuery };
  } catch (err) {
    return { type: "TEXT", searchQuery: "" };
  }
}

async function searchCommonsImage(query) {
  try {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=800&format=json&origin=*`;
    const res = await fetch(url); if (!res.ok) return null;
    const data = await res.json(); const pages = data?.query?.pages; if (!pages) return null;
    const page = Object.values(pages)[0]; const info = page?.imageinfo?.[0]; if (!info) return null;
    return {
      url: info.thumburl || info.url,
      title: String(page.title || "").replace(/^File:/, ""),
      artist: stripHtml(info.extmetadata?.Artist?.value),
      license: stripHtml(info.extmetadata?.LicenseShortName?.value),
      sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
      sourceName: "Wikimedia Commons"
    };
  } catch { return null; }
}

function buildImageMarkdown(image, message) {
  return `![${(image.title || "Kép").replace(/[\[\]]/g, "")}](${image.url})\n\n**${image.title}** — ${image.artist || "Ismeretlen"} (${image.license || "CC"})\nForrás: [${image.sourceName}](${image.sourcePage})\n\n## Forrásjegyzék\n- ${image.sourceName}`;
}

// --- NETLIFY COMPATIBLE EXPORT ---
export default async function handler(req) {
  try {
    if (req.method === "OPTIONS") return corsOptionsResponse();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    // Biztonságos JSON törzs beolvasás
    let body = {};
    try {
      const rawBody = await req.text();
      if (rawBody) body = JSON.parse(rawBody);
    } catch (jsonErr) {
      console.error("JSON parse error in body:", jsonErr);
      return jsonResponse({ error: "Érvénytelen JSON kérés." }, 400);
    }

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Jelentkezz be!" }, 401);

    const message = cleanText(body.message || body.query || "", 12000);
    if (!message) return jsonResponse({ error: "Hiányzó üzenet." }, 400);

    const classification = await classifyRequest(message);

    if (classification.type === "IMAGE") {
      const image = await searchCommonsImage(classification.searchQuery);
      if (!image) return singleChunkStream("Sajnálom, nem találtam szabadon felhasználható képet ehhez a témához.");
      return singleChunkStream(buildImageMarkdown(image, message));
    }

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const promptText = buildPrompt({ message, notesContext, history: body.history || [] });

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      systemInstruction: buildSystemInstructionText(),
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    });

    async function* generator() {
      for await (const chunk of stream) {
        const text = chunk?.text || chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (text) yield text;
      }
    }

    return textStreamResponse(generator());

  } catch (error) {
    console.error("Fatal error inside function:", error);
    return jsonResponse({ error: "Belső szerverhiba történt." }, 500);
  }
}
