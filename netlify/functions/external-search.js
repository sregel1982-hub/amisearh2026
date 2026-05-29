/**
 * /.netlify/functions/external-search
 *  POST { query, lang, includeForeign }
 *
 *  Külső, ingyenes akadémiai forrásokban keres:
 *   - OpenAlex (https://api.openalex.org) — kulcs nélkül, magyar + angol
 *   - arXiv (http://export.arxiv.org)    — kulcs nélkül, angol
 *
 *  Visszaadás: { results: [{ title, authors, year, abstract, pdfUrl,
 *                            sourceUrl, source, language }] }
 */

const OPENALEX = "https://api.openalex.org/works";
const ARXIV = "https://export.arxiv.org/api/query";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const query = (body.query || "").trim();
  if (!query) {
    return new Response(JSON.stringify({ results: [] }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  const lang = body.lang === "hu" ? "hu" : "en";
  const includeForeign = !!body.includeForeign;

  const tasks = [];

  /* OpenAlex elsődleges nyelven */
  tasks.push(searchOpenAlex(query, lang, 10));

  /* OpenAlex idegen nyelven (ha kérik) */
  if (includeForeign) {
    const other = lang === "hu" ? "en" : "hu";
    tasks.push(searchOpenAlex(query, other, 5));
  }

  /* arXiv csak angolul érdekes, de mindig megnézzük (kis költség)
     - ha a query magyar, akkor csak ha includeForeign=true */
  if (lang === "en" || includeForeign) {
    tasks.push(searchArxiv(query, 5));
  }

  const settled = await Promise.allSettled(tasks);
  let results = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      results = results.concat(r.value);
    }
  }

  /* Sortolás: PDF letölthető előre, aztán relevancia */
  results.sort((a, b) => {
    if (a.pdfUrl && !b.pdfUrl) return -1;
    if (!a.pdfUrl && b.pdfUrl) return 1;
    return 0;
  });

  return new Response(JSON.stringify({ results: results.slice(0, 25) }), {
    headers: { "Content-Type": "application/json" }
  });
}

async function searchOpenAlex(q, lang, perPage) {
  try {
    const params = new URLSearchParams({
      search: q,
      per_page: String(perPage),
      filter: `language:${lang}`,
      // emailt küldünk: "polite pool" — gyorsabb, stabilabb
      mailto: "info@amisearch.app"
    });
    const url = `${OPENALEX}?${params.toString()}`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.results || []).map((w) => {
      const oa = w.open_access || {};
      const primary = w.primary_location || {};
      return {
        title: w.title || w.display_name || "Untitled",
        authors: (w.authorships || [])
          .slice(0, 4)
          .map((a) => a?.author?.display_name)
          .filter(Boolean)
          .join(", "),
        year: w.publication_year || null,
        abstract: reconstructAbstract(w.abstract_inverted_index),
        pdfUrl: oa.oa_url || primary.pdf_url || null,
        sourceUrl: w.doi
          ? `https://doi.org/${w.doi.replace("https://doi.org/", "")}`
          : primary.landing_page_url || w.id,
        source: "OpenAlex",
        language: lang
      };
    });
  } catch (e) {
    console.error("OpenAlex error:", e);
    return [];
  }
}

async function searchArxiv(q, max) {
  try {
    const params = new URLSearchParams({
      search_query: `all:${q}`,
      start: "0",
      max_results: String(max)
    });
    const url = `${ARXIV}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const xml = await r.text();
    return parseArxiv(xml);
  } catch (e) {
    console.error("arXiv error:", e);
    return [];
  }
}

function parseArxiv(xml) {
  const out = [];
  const entries = xml.split("<entry>").slice(1);
  for (const e of entries) {
    const get = (tag) => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const id = get("id");
    const title = get("title").replace(/\s+/g, " ");
    const summary = get("summary").replace(/\s+/g, " ");
    const published = get("published");
    const year = published ? Number(published.slice(0, 4)) : null;
    const authors = [];
    const authorMatches = e.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>/g);
    for (const m of authorMatches) authors.push(m[1].trim());
    const pdfMatch = e.match(/href="([^"]+\.pdf)"/);
    const pdfUrl = pdfMatch ? pdfMatch[1] : null;
    out.push({
      title,
      authors: authors.slice(0, 4).join(", "),
      year,
      abstract: summary.slice(0, 400),
      pdfUrl,
      sourceUrl: id,
      source: "arXiv",
      language: "en"
    });
  }
  return out;
}

/* OpenAlex "inverted index" → plain string */
function reconstructAbstract(inv) {
  if (!inv || typeof inv !== "object") return "";
  const arr = [];
  for (const word of Object.keys(inv)) {
    for (const pos of inv[word]) arr[pos] = word;
  }
  return arr.filter(Boolean).join(" ").slice(0, 400);
}

export const config = {};
