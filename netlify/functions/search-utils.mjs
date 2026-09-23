// netlify/functions/search-utils.mjs — TELJES, JAVÍTOTT VERZIÓ
const COMMONS_UA = "AMISEARCH/1.0 (https://amisearch.org; info@amisearch.app)";

const getEnv = (k) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(k)) || process.env[k];

// "Kép kellene egy minaretről" → "minaret"
export function extractImageQuery(message) {
  let q = String(message || "").toLowerCase().normalize("NFC");
  q = q.replace(/\b(kép|képet|képek|fotó|fotót|fotók|illusztráció|ábra|rajz|image|photo|picture|illustration)\b/g, " ");
  q = q.replace(/\b(kellene|kéne|kérek|kérnék|szeretnék|mutass|mutasd|keress|keresd|találj|adj|akarok|legyen|volna|please|show|find|search|give|need|want|about)\b/g, " ");
  q = q.replace(/\b(egy|a|az|olyan|ilyen)\b/g, " ");
  q = q.replace(/(ról|ről|tól|től|ból|ből|nak|nek|ban|ben|ba|be|on|en|ön|hoz|hez|höz|val|vel|ért|vá|vé|ig)\b/g, " ");
  q = q.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  if (q.length >= 2) return q;
  const words = String(message || "").toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4).sort((a, b) => b.length - a.length);
  return words.slice(0, 3).join(" ");
}

function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
}

async function searchCommonsImage(query) {
  const params = new URLSearchParams({
    action: "query", generator: "search",
    gsrsearch: query, gsrnamespace: "6", gsrlimit: "8",
    prop: "imageinfo", iiprop: "url|extmetadata|mime",
    iiurlwidth: "1000", format: "json",
  });
  const r = await fetch("https://commons.wikimedia.org/w/api.php?" + params.toString(),
    { headers: { "User-Agent": COMMONS_UA, Accept: "application/json" } });
  if (!r.ok) return null;
  const d = await r.json();
  const pages = d?.query?.pages;
  if (!pages) return null;
  const list = Object.values(pages).filter((p) => p?.imageinfo?.[0])
    .sort((a, b) => (a.index || 99) - (b.index || 99));
  for (const p of list) {
    const info = p.imageinfo[0];
    const mime = info.mime || "";
    if (mime && !/^image\/(jpeg|png|webp)$/.test(mime)) continue;
    const url = info.thumburl || info.url;
    if (!url || /\.(svg|gif|tiff?|pdf)(\?|$)/i.test(url)) continue;
    const meta = info.extmetadata || {};
    return {
      url,
      title: stripHtml(meta.ImageDescription?.value) || (p.title || "Kép").replace(/^File:/, ""),
      source: "Wikimedia Commons",
      sourceUrl: info.descriptionurl || info.url,
    };
  }
  return null;
}

// Openverse — kulcs nélküli CC képes adatbázis (tartalék)
async function searchOpenverseImage(query) {
  const r = await fetch("https://api.openverse.org/v1/images/?q=" +
    encodeURIComponent(query) + "&page_size=6",
    { headers: { "User-Agent": COMMONS_UA, Accept: "application/json" } });
  if (!r.ok) return null;
  const d = await r.json();
  const item = (d.results || []).find((i) => i.url && /\.(jpe?g|png|webp)(\?|$)/i.test(i.url));
  if (!item) return null;
  return {
    url: item.url, title: item.title || "Kép",
    source: item.source || "Openverse",
    sourceUrl: item.foreign_landing_url || item.url,
  };
}

async function searchPexelsImage(query) {
  const key = getEnv("PEXELS_API_KEY");
  if (!key) return null;
  const r = await fetch("https://api.pexels.com/v1/search?query=" +
    encodeURIComponent(query) + "&per_page=5", { headers: { Authorization: key } });
  if (!r.ok) return null;
  const d = await r.json();
  const p = d.photos && d.photos[0];
  if (!p) return null;
  return {
    url: p.src?.medium2 || p.src?.large || p.src?.original,
    title: p.alt || "Fotó", source: "Pexels", sourceUrl: p.url,
  };
}

export async function imageSearch(message) {
  const q = extractImageQuery(message);
  if (!q) return null;
  try { const img = await searchCommonsImage(q); if (img) return img; }
  catch (e) { console.error("[search-utils] commons:", e?.message); }
  try { const img = await searchOpenverseImage(q); if (img) return img; }
  catch (e) { console.error("[search-utils] openverse:", e?.message); }
  try { const img = await searchPexelsImage(q); if (img) return img; }
  catch (e) { console.error("[search-utils] pexels:", e?.message); }
  return null;
}

export async function webSearch(query, lang = "hu") {
  try {
    const key = getEnv("GEMINI_API_KEY");
    if (!key) return { isTask: false, summary: "", sources: [] };
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: key });
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text:
        "Summarize in 3-5 short sentences in " + (lang === "hu" ? "Hungarian" : "English") +
        " what reliable sources say about: " + query }] }],
      config: { tools: [{ googleSearch: {} }], temperature: 0.2, maxOutputTokens: 600 },
    });
    const chunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.map((c) => ({ title: c.web?.title || "", url: c.web?.uri || "" }))
      .filter((s) => s.url).slice(0, 5);
    return { isTask: false, summary: res.text || "", sources };
  } catch (e) {
    console.error("[search-utils] webSearch:", e?.message);
    return { isTask: false, summary: "", sources: [] };
  }
}
