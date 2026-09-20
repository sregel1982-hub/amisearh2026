// V6.0 - Szélesebb forráskör: Wikipedia, OpenAlex, Semantic Scholar, Crossref,
// Open Library (könyvek), DuckDuckGo + kép: Wikimedia Commons, Openverse, Pixabay
const IS_TASK = /(feladat|egyenlet|példa|generálj|készíts|oldj meg|gyakorló|teszt|kvíz|feladatsor)/i;

function translate(q) {
  const map = { "felvilágosodás": "Age of Enlightenment", "templom": "church", "korona": "Holy Crown of Hungary", "ford t": "Ford Model T" };
  const low = q.toLowerCase();
  for (const k in map) { if (low.includes(k)) return map[k]; }
  return q;
}

function cleanImageQuery(q) {
  return String(q || '')
    .replace(/^(kérlek\s+)?(keress|keresd|mutass|mutasd|adj|találj|szeretnék|akarok|akarnék|kellene|kéne|mutatnál|tudnál\s+mutatni|légy\s+szíves|show|find|search|give|need|want)\s+(nekem\s+)?/i, '')
    .replace(/\b(egy|bármilyen|valamilyen|akármilyen)\b/gi, '')
    .replace(/\b(képet|képeket|kép|fotót|fotó|illusztrációt|illusztráció|ábrát|ábra|image|photo|picture|illustration)\b/gi, '')
    .replace(/\b(a|az|ról|ről|ból|ből|ban|ben|nak|nek|nál|nél|val|vel)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(ról|ről|ból|ből|ban|ben|nak|nek|val|vel)$/i, '')
    .trim() || q;
}

async function searchCommons(term) {
  try {
    const r = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1000&format=json&origin=*`);
    const d = await r.json();
    const pages = Object.values(d?.query?.pages || {});
    const p = pages.find(page => page?.imageinfo?.[0]?.url);
    const info = p?.imageinfo?.[0];
    return info ? {
      url: info.thumburl || info.url,
      title: (p.title || 'Kép').replace(/^File:/, ''),
      source: "Wikimedia Commons",
      sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`
    } : null;
  } catch { return null; }
}

// Openverse: kulcs nélkül elérhető, szabadon felhasználható (CC) képek aggregátora
async function searchOpenverse(term) {
  try {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(term)}&page_size=5`);
    const d = await r.json();
    const item = (d?.results || []).find(x => x?.url);
    return item ? {
      url: item.thumbnail || item.url,
      title: item.title || 'Kép',
      source: item.source ? `Openverse (${item.source})` : "Openverse",
      sourceUrl: item.foreign_landing_url || item.url
    } : null;
  } catch { return null; }
}

// Pixabay: csak akkor fut, ha a PIXABAY_API_KEY Netlify env var be van állítva
async function searchPixabay(term) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(term)}&image_type=photo&safesearch=true&per_page=5`);
    const d = await r.json();
    const hit = (d?.hits || [])[0];
    return hit ? {
      url: hit.webformatURL,
      title: hit.tags || 'Kép',
      source: "Pixabay",
      sourceUrl: hit.pageURL
    } : null;
  } catch { return null; }
}

export async function imageSearch(q) {
  const term = translate(cleanImageQuery(q));
  // Sorban próbálkozunk: Wikimedia Commons -> Openverse -> Pixabay (ha van kulcs)
  return (await searchCommons(term)) || (await searchOpenverse(term)) || (await searchPixabay(term));
}

export async function webSearch(q, lang) {
  // HA FELADAT -> NE keress tudományos cikkekben!
  if (IS_TASK.test(q)) { return { isTask: true, summary: "", sources: [] }; }

  const tq = translate(q);

  // EGYÉBKÉNT széles forráskörben keres: lexikon, tudományos, szakfolyóirat, könyv, általános web
  const jobs = [
    fetch(`https://hu.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(d => d.extract ? { title: d.title, summary: d.extract.slice(0, 500), url: d.content_urls.desktop.page, source: "Wikipedia HU" } : null)
      .catch(() => null),

    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tq)}`)
      .then(r => r.json())
      .then(d => d.extract ? { title: d.title, summary: d.extract.slice(0, 500), url: d.content_urls.desktop.page, source: "Wikipedia EN" } : null)
      .catch(() => null),

    fetch(`https://api.openalex.org/works?search=${encodeURIComponent(tq)}&per-page=1`)
      .then(r => r.json())
      .then(d => { const w = d.results?.[0]; return w ? { title: w.display_name, summary: (w.abstract_inverted_index ? Object.keys(w.abstract_inverted_index).slice(0, 30).join(" ") : "").slice(0, 400), url: w.id, source: "OpenAlex" } : null; })
      .catch(() => null),

    fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(tq)}&limit=1&fields=title,abstract,url`)
      .then(r => r.json())
      .then(d => { const w = d?.data?.[0]; return w ? { title: w.title, summary: (w.abstract || '').slice(0, 400), url: w.url, source: "Semantic Scholar" } : null; })
      .catch(() => null),

    fetch(`https://api.crossref.org/works?query=${encodeURIComponent(tq)}&rows=1`)
      .then(r => r.json())
      .then(d => { const w = d?.message?.items?.[0]; if (!w) return null; const title = Array.isArray(w.title) ? w.title[0] : w.title; const journal = Array.isArray(w['container-title']) ? w['container-title'][0] : ''; return title ? { title, summary: journal || 'Szakfolyóirat cikk', url: w.URL, source: "Crossref (szakfolyóirat)" } : null; })
      .catch(() => null),

    fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(tq)}&limit=1`)
      .then(r => r.json())
      .then(d => { const w = d?.docs?.[0]; return w ? { title: w.title, summary: (w.author_name || []).join(', ') || 'Online könyv', url: `https://openlibrary.org${w.key}`, source: "Open Library (könyv)" } : null; })
      .catch(() => null),

    fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`)
      .then(r => r.json())
      .then(d => d.AbstractText ? { title: d.Heading || q, summary: d.AbstractText.slice(0, 500), url: d.AbstractURL, source: "DuckDuckGo" } : null)
      .catch(() => null)
  ];

  const res = (await Promise.all(jobs)).filter(Boolean);
  return { isTask: false, summary: res.map(r => `[${r.source}] ${r.title}: ${r.summary}`).join("\n"), sources: res };
}
