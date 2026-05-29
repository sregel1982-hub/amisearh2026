/**
 * /.netlify/functions/external-search
 *  POST { query, lang, includeForeign }
 *
 *  Külső, ingyenes akadémiai forrásokban keres:
 *   - OpenAlex (https://api.openalex.org) — kulcs nélkül
 *   - arXiv (http://export.arxiv.org)    — kulcs nélkül
 *
 *  Stratégia:
 *   - HU query: OpenAlex relevance search filter NÉLKÜL (jobb recall),
 *               + ha vannak Hungarian-tagged eredmények, előre soroljuk
 *   - EN query: OpenAlex english + arXiv
 *   - includeForeign=true: a másik nyelvet is hozzáadjuk
 */

const OPENALEX = "https://api.openalex.org/works";
const ARXIV = "https://export.arxiv.org/api/query";
const MAILTO = "info@amisearch.app";

export default async function handler(req) {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return jerr("Invalid JSON", 400);
  }

  const query = (body.query || "").trim();
  if (!query) return jok({ results: [] });

  const lang = body.lang === "hu" ? "hu" : "en";
  const includeForeign = !!body.includeForeign;

  const tasks = [];

  if (lang === "hu") {
    /* Magyar query: szűrő NÉLKÜL relevance — sok hu doc nincs nyelv-taggel */
    tasks.push(searchOpenAlex(query, null, 15, "hu"));
    if (includeForeign) {
      /* Idegen nyelv is: angolul is kerestünk + arXiv */
      tasks.push(searchOpenAlex(query, "en", 10, "en"));
      tasks.push(searchArxiv(query, 5));
    }
  } else {
    /* Angol query: szigorúbb english filter + arXiv */
    tasks.push(searchOpenAlex(query, "en", 15, "en"));
    tasks.push(searchArxiv(query, 5));
    if (includeForeign) {
      tasks.push(searchOpenAlex(query, "hu", 5, "hu"));
    }
  }

  const settled = await Promise.allSettled(tasks);
  let results = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && Array.isArray(r.value))
      results = results.concat(r.value);
  }

  /* dedup by sourceUrl */
  const seen = new Set();
  results = results.filter((r) => {
    const k = r.sourceUrl || r.title;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  /* Rangsor: a query nyelvével megegyező nyelvű ÉS PDF-fel rendelkező előre */
  const wantLang = lang;
  results.sort((a, b) => {
    const al = a.language === wantLang ? 1 : 0;
    const bl = b.language === wantLang ? 1 : 0;
    if (bl - al !== 0) return bl - al;
    if (!!b.pdfUrl - !!a.pdfUrl !== 0) return (!!b.pdfUrl) - (!!a.pdfUrl);
    return 0;
  });

  return jok({ results: results.slice(0, 25), query, lang, includeForeign });
}

/* ────────────────  OpenAlex  ──────────────── */
async function searchOpenAlex(q, langFilter, perPage, taggedLang) {
  try {
    let results = await openAlexQuery(q, langFilter, perPage, taggedLang);
    /* Ha üres és a query több szót tartalmaz, próbáljuk meg
       a leghosszabb szóval is külön (broader recall) */
    if (results.length === 0) {
      const words = q
        .split(/\s+/)
        .filter((w) => w.length >= 4)
        .sort((a, b) => b.length - a.length);
      if (words.length > 1) {
        const broader = await openAlexQuery(words[0], langFilter, perPage, taggedLang);
        results = broader;
      }
    }
    return results;
  } catch (e) {
    console.error("OpenAlex error:", e?.message);
    return [];
  }
}

async function openAlexQuery(q, langFilter, perPage, taggedLang) {
  const params = new URLSearchParams({
    search: q,
    per_page: String(perPage),
    mailto: MAILTO
  });
  if (langFilter) params.set("filter", `language:${langFilter}`);
  const url = `${OPENALEX}?${params.toString()}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) {
    console.error("[external-search] OpenAlex", r.status, await r.text());
    return [];
  }
  const data = await r.json();
  return (data.results || []).map((w) => {
    const oa = w.open_access || {};
    const primary = w.primary_location || {};
    const lang = w.language || taggedLang || null;
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
}

/* ────────────────  arXiv  ──────────────── */
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
    console.error("arXiv error:", e?.message);
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

/* OpenAlex inverted index → plain string */
function reconstructAbstract(inv) {
  if (!inv || typeof inv !== "object") return "";
  const arr = [];
  for (const word of Object.keys(inv)) {
    for (const pos of inv[word]) arr[pos] = word;
  }
  return arr.filter(Boolean).join(" ").slice(0, 400);
}

function jok(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}
function jerr(m, s = 400) {
  return new Response(JSON.stringify({ error: m }), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
