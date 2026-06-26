import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// -------------------------------
// LANGUAGE DETECTION
// -------------------------------

export async function detectLanguage(text) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Detect the language of this text. Respond ONLY with the ISO code (hu, en, de, es, fr, etc.):\n\n"${text}"` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 5 }
    });
    const lang = result?.text?.trim()?.toLowerCase() || "en";
    return lang.match(/^[a-z]{2}$/) ? lang : "en";
  } catch {
    return "en";
  }
}

// -------------------------------
// ACADEMIC SEARCH
// -------------------------------

async function searchSemanticScholar(query) {
  try {
    const res = await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=title,abstract,year,authors,url`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.data?.[0];
    if (!p?.abstract) return null;
    return { title: p.title, summary: p.abstract, url: p.url, source: "Semantic Scholar" };
  } catch { return null; }
}

async function searchCORE(query) {
  const key = process.env.CORE_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://core.ac.uk:443/api-v2/articles/search/${encodeURIComponent(query)}?page=1&pageSize=1&apiKey=${key}`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.data?.[0];
    if (!p) return null;
    return { title: p.title, summary: p.abstract, url: p.downloadUrl || p.fullTextIdentifier, source: "CORE" };
  } catch { return null; }
}

async function searchArxiv(query) {
  try {
    const res = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=1`);
    if (!res.ok) return null;
    const xml = await res.text();
    const title = xml.match(/<title>(?!ArXiv)([^<]+)<\/title>/)?.[1];
    const summary = xml.match(/<summary>([^<]+)<\/summary>/)?.[1];
    const link = xml.match(/<id>(https[^<]+)<\/id>/)?.[1];
    if (!title || !summary) return null;
    return { title: title.trim(), summary: summary.trim(), url: link, source: "arXiv" };
  } catch { return null; }
}

async function searchOpenAlex(query) {
  try {
    const res = await fetch(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(query)}&per-page=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const w = data?.results?.[0];
    if (!w) return null;
    const abstract = w.abstract_inverted_index
      ? Object.entries(w.abstract_inverted_index)
          .flatMap(([word, positions]) => positions.map(pos => ({ word, pos })))
          .sort((a, b) => a.pos - b.pos)
          .map(x => x.word).join(" ")
      : "";
    return { title: w.display_name, summary: abstract, url: w.id, source: "OpenAlex" };
  } catch { return null; }
}

export async function academicSearch(query) {
  return (
    await searchSemanticScholar(query) ||
    await searchCORE(query) ||
    await searchArxiv(query) ||
    await searchOpenAlex(query)
  );
}

// -------------------------------
// WIKIPEDIA (többnyelvű)
// -------------------------------

export async function wikipediaSearch(query, lang = "en") {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.extract) return null;
    return { title: data.title, summary: data.extract, url: data.content_urls?.desktop?.page, source: `Wikipedia (${lang})` };
  } catch { return null; }
}

// -------------------------------
// DUCKDUCKGO FALLBACK
// -------------------------------

export async function duckduckgoSearch(query) {
  try {
    const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.AbstractText) return null;
    return { title: data.Heading || query, summary: data.AbstractText, url: data.AbstractURL, source: "DuckDuckGo" };
  } catch { return null; }
}

// -------------------------------
// KOMBINÁLT WEB KERESÉS (több forrás egyszerre)
// -------------------------------

export async function webSearch(query, lang = "en") {
  const [academic, wiki, ddg] = await Promise.allSettled([
    academicSearch(query),
    wikipediaSearch(query, lang),
    duckduckgoSearch(query)
  ]);

  const results = [
    academic.status === "fulfilled" ? academic.value : null,
    wiki.status === "fulfilled" ? wiki.value : null,
    ddg.status === "fulfilled" ? ddg.value : null
  ].filter(Boolean);

  if (results.length === 0) return null;

  // Visszaadjuk az összes forrást egységesített formában
  return {
    summary: results.map(r => `[${r.source}] ${r.title}\n${r.summary}`).join("\n\n---\n\n"),
    url: results[0].url,
    source: results.map(r => r.source).join(", "),
    sources: results
  };
}

// -------------------------------
// KÉPKERESÉS
// -------------------------------

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "").trim();
}

async function searchCommonsImage(query) {
  try {
    const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    const info = page?.imageinfo?.[0];
    if (!info) return null;
    return {
      url: info.thumburl || info.url,
      title: page.title.replace(/^File:/, ""),
      artist: stripHtml(info.extmetadata?.Artist?.value),
      license: stripHtml(info.extmetadata?.LicenseShortName?.value),
      source: "Wikimedia Commons",
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
    };
  } catch { return null; }
}

async function searchUnsplashImage(query) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: `Client-ID ${key}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.results?.[0];
    if (!p) return null;
    return {
      url: p.urls?.regular,
      title: p.description || p.alt_description || "Unsplash photo",
      artist: p.user?.name,
      license: "Unsplash License",
      source: "Unsplash",
      sourceUrl: p.links?.html
    };
  } catch { return null; }
}

async function searchPexelsImage(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`, {
      headers: { Authorization: key }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.photos?.[0];
    if (!p) return null;
    return {
      url: p.src?.medium || p.src?.original,
      title: p.alt || "Pexels photo",
      artist: p.photographer,
      license: "Pexels License",
      source: "Pexels",
      sourceUrl: p.url
    };
  } catch { return null; }
}

async function searchPixabayImage(query) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&per_page=1`);
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.hits?.[0];
    if (!p) return null;
    return {
      url: p.webformatURL,
      title: p.tags,
      artist: p.user,
      license: "Pixabay License",
      source: "Pixabay",
      sourceUrl: p.pageURL
    };
  } catch { return null; }
}

async function searchAnatomyImage(query) {
  try {
    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original&format=json&origin=*&titles=${encodeURIComponent(query + " anatomy")}`);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    const img = page?.original;
    if (!img) return null;
    return {
      url: img.source,
      title: page.title,
      artist: "",
      license: "Wikipedia (CC)",
      source: "Wikipedia Anatomy",
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`
    };
  } catch { return null; }
}

export async function imageSearch(query) {
  return (
    await searchCommonsImage(query) ||
    await searchUnsplashImage(query) ||
    await searchPexelsImage(query) ||
    await searchPixabayImage(query) ||
    await searchAnatomyImage(query)
  );
}
