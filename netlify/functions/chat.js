// ===============================
// AMISEARCH 2026 – CHAT ENGINE
// STRUKTURÁLT MINDMAP + TÖBBFORRÁSÚ KÉPKERESÉS
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

// Egyetlen szöveges darab streamként visszaadása (kép-eredményhez / hibaüzenethez)
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

// --- RENDSZERUTASÍTÁS (normál + mindmap válaszhoz) ---
function buildSystemInstructionText() {
  return `
Te az AMISEARCH oktatási asszisztense vagy. Mindig magyarul válaszolj.

- Adj pontos, jól strukturált, oktatási célú válaszokat.
- Ha hasznos, használj táblázatot és felsorolást.

JEGYZETEK HASZNÁLATA:
- A feltöltött jegyzetek és előzmények csak KIEGÉSZÍTŐ kontextusként szolgálnak.
- A válaszokhoz, és különösen a diagramokhoz/gondolattérképekhez, szabadon használd az általános tudásodat is.
- Ha a jegyzetek nem tartalmaznak elég információt a kérdéses témáról, NE korlátozd a választ vagy a diagramot a jegyzetek tartalmára – egészítsd ki általános, megbízható tudással.

DIAGRAM / ÁBRA / IDŐVONAL / FOLYAMATÁBRA / GONDOLATTÉRKÉP KÉRÉSEKOR:
- Ha a felhasználó diagramot, ábrát, folyamatábrát, idővonalat, gondolattérképet vagy vizualizációt kér, írj egy rövid (1-3 mondatos) magyar magyarázatot, majd illessz be UTÁNA egy Mermaid MINDMAP kódblokkot, pontosan ezekkel a szabályokkal:

1. Az első sor pontosan: mindmap
2. A második sor a gyökér, pontosan így: root((Téma neve))
3. A további sorok ágak, 2 szóköz behúzással szintenként (1. szint: 2 szóköz, 2. szint: 4 szóköz, 3. szint: 6 szóköz).
4. STRUKTÚRA: ha a téma több alterületre bontható (pl. egy uralkodó élete, egy folyamat szakaszai, egy fogalom kategóriái), az 1. szintű ágak legyenek 3-5 FŐ TÉMAKÖR (kategória), és minden fő témakör alá tegyél 2-3 konkrét, részletes 2. szintű ágat. Ez adja a jól strukturált, áttekinthető elrendezést.
5. Ha a kérés egyszerű, lineáris adatsor (pl. évek szerinti számadatok), akkor az 1. szintű ágak közvetlenül az adatpontok lehetnek, pl.: 1990: 10.4 millió fő
6. NE használj emojit, idézőjelet (kivéve ha a gyökérben muszáj), kapcsos {}, szögletes [] zárójelet, pipe | karaktert, vagy dupla zárójelet (kivéve a gyökérnél).
7. Összesen maximum kb. 12-15 ág legyen – legyen tömör és áttekinthető, ne legyen túl sok vagy túl kusza.
8. A kódblokk formátuma – KATEGORIZÁLT téma esetén (példa):

\`\`\`mermaid
mindmap
  root((Mátyás uralkodása))
    Belső politika
      Trónra lépés 1458
      Központosított állam
    Gazdasági reformok
      Adóreform
      Vámok
    Kultúra és tudomány
      Corvinák
      Egyetemek
    Külpolitika
      Ausztria elleni háborúk
      Cseh háborúk
\`\`\`

   – LINEÁRIS adatsor esetén (példa):

\`\`\`mermaid
mindmap
  root((Magyarország népessége))
    1990: 10.4 millió fő
    2000: 10.2 millió fő
    2010: 10.0 millió fő
    2020: 9.7 millió fő
    2023: 9.6 millió fő
\`\`\`

- Soha ne mondd, hogy "nem tudok képet/diagramot készíteni" – mindig próbálj mindmap kódblokkot adni, ha a kérés vizualizációra vonatkozik.
- Tilos JSON-t, kép-leírást, "image_description" mezőt, vagy más Mermaid típust (flowchart, xychart-beta, pie, sequenceDiagram) írni a válaszba – KIZÁRÓLAG mindmap típust használj.

A válasz végén legyen "## Forrásjegyzék".
`;
}

// --- JEGYZETEK ---
async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 30000);
  if (inline) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}\n\nFONTOS: Elsődlegesen ezt használd, de szükség esetén egészítsd ki általános tudással!`);

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
    notesContext ? `## Dokumentumok és jegyzetek (kiegészítő kontextus)\n${notesContext}\n\n` : "",
    historyText ? `## Előzmények\n${historyText}\n\n` : "",
    `## Aktuális kérdés\n${message}`,
  ].filter(Boolean).join("");
}

// --- KLASSZIFIKÁCIÓ: valódi kép kell, vagy szöveges/mindmap válasz ---
async function classifyRequest(message) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [{
          text: `Döntsd el, hogy a következő magyar nyelvű kérés egy VALÓDI FÉNYKÉPET vagy ILLUSZTRÁCIÓT kér egy konkrét személyről, helyről, tárgyról vagy eseményről (pl. "kép", "ábra", "fotó", "hogy néz ki", "mutass", "kellene egy ábra X-ről", "nézzük meg X-et"), vagy egy NORMÁL VÁLASZT, MAGYARÁZATOT, DIAGRAMOT, FOLYAMATÁBRÁT, IDŐVONALAT, GONDOLATTÉRKÉPET kér (ezeket mindmap diagrammal lehet ábrázolni, NEM fényképpel).

Válaszolj KIZÁRÓLAG ebben a formátumban, két sorban, semmi mást:
TIPUS: IMAGE vagy TEXT
KERESES: <ha TIPUS=IMAGE, egy rövid 1-4 szavas ANGOL keresőkifejezés a témához (pl. "Budapest Parliament building"); ha TIPUS=TEXT, írj egyetlen kötőjelet ->

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
    searchQuery = searchQuery.replace(/["'`]/g, "");
    if (searchQuery === "-" || !searchQuery) searchQuery = message.slice(0, 60);

    return { type, searchQuery };
  } catch (err) {
    console.error("Classify error:", err);
    return { type: "TEXT", searchQuery: "" };
  }
}

// ===============================
// KÉPKERESÉS – TÖBB INGYENES FORRÁS
// Sorban próbálkozunk, az első találatot használjuk.
// Minden forrás ugyanazt a formát adja vissza:
// { url, title, artist, license, sourcePage, sourceName }
// ===============================

// 1. Wikimedia Commons
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
      if (!mime.startsWith("image/")) continue;

      const meta = info.extmetadata || {};
      return {
        url: info.thumburl || info.url,
        title: String(page.title || "").replace(/^File:/, ""),
        artist: stripHtml(meta.Artist?.value),
        license: stripHtml(meta.LicenseShortName?.value),
        sourcePage: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        sourceName: "Wikimedia Commons",
      };
    }
    return null;
  } catch (err) {
    console.error("Commons search error:", err);
    return null;
  }
}

// 2. Openverse – nagy CC-licencű képaggregátor (Flickr Commons, Europeana, múzeumok, stb.)
async function searchOpenverseImage(query) {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=5`;
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!res.ok) return null;

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const item of results) {
      const imgUrl = item.thumbnail || item.url;
      if (!imgUrl) continue;

      return {
        url: imgUrl,
        title: item.title || "",
        artist: item.creator || "",
        license: [item.license, item.license_version].filter(Boolean).join(" ").toUpperCase(),
        sourcePage: item.foreign_landing_url || item.url || "",
        sourceName: "Openverse",
      };
    }
    return null;
  } catch (err) {
    console.error("Openverse search error:", err);
    return null;
  }
}

// 3. NASA Image and Video Library – űrkutatás, csillagászat témákhoz
async function searchNasaImage(query) {
  try {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const items = data?.collection?.items || [];

    for (const item of items) {
      const links = Array.isArray(item.links) ? item.links : [];
      const imageLink = links.find(l => l.render === "image") || links[0];
      if (!imageLink?.href) continue;

      const meta = item.data?.[0] || {};
      return {
        url: imageLink.href,
        title: meta.title || "",
        artist: meta.center || meta.photographer || "NASA",
        license: "Közkincs (NASA)",
        sourcePage: meta.nasa_id ? `https://images.nasa.gov/details/${meta.nasa_id}` : "https://images.nasa.gov",
        sourceName: "NASA Image and Video Library",
      };
    }
    return null;
  } catch (err) {
    console.error("NASA search error:", err);
    return null;
  }
}

// 4. The Metropolitan Museum of Art – Open Access gyűjtemény (művészet, történelem)
async function searchMetMuseumImage(query) {
  try {
    const searchUrl = `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;

    const searchData = await searchRes.json();
    const ids = Array.isArray(searchData?.objectIDs) ? searchData.objectIDs.slice(0, 5) : [];

    for (const id of ids) {
      const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
      if (!objRes.ok) continue;

      const obj = await objRes.json();
      const imgUrl = obj.primaryImageSmall || obj.primaryImage;
      if (!imgUrl) continue;

      return {
        url: imgUrl,
        title: obj.title || "",
        artist: obj.artistDisplayName || "Ismeretlen alkotó",
        license: "Közkincs (The Met, Open Access)",
        sourcePage: obj.objectURL || "https://www.metmuseum.org",
        sourceName: "The Metropolitan Museum of Art",
      };
    }
    return null;
  } catch (err) {
    console.error("Met Museum search error:", err);
    return null;
  }
}

// 5. Library of Congress – történelmi fotók, dokumentumok
async function searchLocImage(query) {
  try {
    const url = `https://www.loc.gov/photos/?q=${encodeURIComponent(query)}&fo=json&c=5`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    for (const item of results) {
      let imgUrl = null;
      if (Array.isArray(item.image_url) && item.image_url.length) {
        imgUrl = item.image_url[0];
      }
      if (!imgUrl) continue;

      const rights = stripHtml(item.rights_advisory?.join?.(" ") || item.rights || "");

      return {
        url: imgUrl,
        title: item.title || "",
        artist: Array.isArray(item.contributor) ? item.contributor.join(", ") : (item.contributor || ""),
        license: rights || "Lásd a forrásnál a jogi információkat",
        sourcePage: item.url || "https://www.loc.gov",
        sourceName: "Library of Congress",
      };
    }
    return null;
  } catch (err) {
    console.error("Library of Congress search error:", err);
    return null;
  }
}

// Orchestrátor: sorban próbálkozik az összes forrással
async function searchFreeImage(query) {
  const sources = [
    searchCommonsImage,
    searchOpenverseImage,
    searchNasaImage,
    searchMetMuseumImage,
    searchLocImage,
  ];

  for (const source of sources) {
    try {
      const result = await source(query);
      if (result?.url) return result;
    } catch (err) {
      console.error("Image source error:", err);
    }
  }
  return null;
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
    lines.push(`Forrás: [${image.sourceName || "kép forrása"}](${image.sourcePage})`);
  }

  lines.push("");
  lines.push("## Forrásjegyzék");
  lines.push(`- ${image.sourceName || "Külső képforrás"}`);

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

    // --- DÖNTÉS: kép vagy szöveges/mindmap válasz ---
    const classification = await classifyRequest(message);

    if (classification.type === "IMAGE") {
      const image = await searchFreeImage(classification.searchQuery);

      if (!image) {
        return singleChunkStream("Sajnálom, nem találtam megfelelő, ingyenesen felhasználható képet ehhez a témához. Próbáld másképp megfogalmazni a kérdést.");
      }

      return singleChunkStream(buildImageMarkdown(image, message));
    }

    // --- NORMÁL SZÖVEGES VÁLASZ (ide tartozik a mindmap is) ---
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
  
