// V6.1 - Jobb képkeresés (nem könyvborító) + releváns források
const IS_TASK = /(feladat|egyenlet|példa|generálj|készíts|oldj meg|gyakorló|teszt|kvíz|feladatsor)/i;

function translate(q) {
  const map = {
    felvilágosodás: 'Age of Enlightenment',
    templom: 'church',
    korona: 'Holy Crown of Hungary',
    'ford t': 'Ford Model T',
    ló: 'horse',
    lovak: 'horses',
    kutya: 'dog',
    macska: 'cat',
  };
  const low = String(q || '').toLowerCase().trim();
  if (map[low]) return map[low];
  for (const k in map) {
    if (low.includes(k)) return map[k];
  }
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

/** Könyvborító / scrap szűrés cím és URL alapján */
function looksLikeBookCover(title, url) {
  const t = String(title || '').toLowerCase();
  const u = String(url || '').toLowerCase();
  return (
    /cover|book|borító|könyv|isbn|paperback|hardcover|edition|kiadás|textbook/.test(t) ||
    /openlibrary|covers\.openlibrary|bookcover|goodreads|amazon\.com\/images/.test(u)
  );
}

async function searchCommons(term) {
  try {
    // filetype:bitmap + -book -cover → inkább fotó
    const q = `${term} filetype:bitmap -book -cover -scan`;
    const r = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata|mime&iiurlwidth=1200&format=json&origin=*`
    );
    const d = await r.json();
    const pages = Object.values(d?.query?.pages || {});
    for (const p of pages) {
      const info = p?.imageinfo?.[0];
      if (!info?.url) continue;
      const title = (p.title || 'Kép').replace(/^File:/, '');
      const mime = (info.mime || '').toLowerCase();
      if (mime && !mime.startsWith('image/')) continue;
      if (looksLikeBookCover(title, info.url)) continue;
      return {
        url: info.thumburl || info.url,
        title,
        source: 'Wikimedia Commons',
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    }
    // fallback: egyszerű keresés
    const r2 = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(term)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime&iiurlwidth=1200&format=json&origin=*`
    );
    const d2 = await r2.json();
    for (const p of Object.values(d2?.query?.pages || {})) {
      const info = p?.imageinfo?.[0];
      if (!info?.url) continue;
      const title = (p.title || 'Kép').replace(/^File:/, '');
      if (looksLikeBookCover(title, info.url)) continue;
      return {
        url: info.thumburl || info.url,
        title,
        source: 'Wikimedia Commons',
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function searchOpenverse(term) {
  try {
    // category=photograph → ne illusztráció / borító
    const r = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(term)}&page_size=10&category=photograph&mature=false`
    );
    const d = await r.json();
    for (const item of d?.results || []) {
      if (!item?.url) continue;
      if (looksLikeBookCover(item.title, item.url) || looksLikeBookCover(item.title, item.foreign_landing_url)) continue;
      return {
        url: item.thumbnail || item.url,
        title: item.title || 'Kép',
        source: item.source ? `Openverse (${item.source})` : 'Openverse',
        sourceUrl: item.foreign_landing_url || item.url,
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function searchPixabay(term) {
  const key = process.env.PIXABAY_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(
      `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(term)}&image_type=photo&safesearch=true&per_page=8`
    );
    const d = await r.json();
    const hit = (d?.hits || [])[0];
    if (!hit) return null;
    return {
      url: hit.webformatURL,
      title: hit.tags || 'Kép',
      source: 'Pixabay',
      sourceUrl: hit.pageURL,
    };
  } catch {
    return null;
  }
}

export async function imageSearch(q) {
  const cleaned = cleanImageQuery(q);
  const termHu = cleaned;
  const termEn = translate(cleaned);
  // Először angol fotó (jobb találati arány), aztán magyar, aztán Openverse, Pixabay
  return (
    (await searchCommons(termEn)) ||
    (await searchCommons(termHu)) ||
    (await searchOpenverse(termEn)) ||
    (await searchOpenverse(termHu)) ||
    (await searchPixabay(termEn)) ||
    (await searchPixabay(termHu))
  );
}

/** Relevancia: a forrás cím/összefoglaló érintse a lekérdezés kulcsszavait */
function isRelevantSource(item, query) {
  if (!item) return false;
  const q = String(query || '').toLowerCase();
  const stop = new Set(['egy', 'egyik', 'valami', 'kell', 'kérek', 'mutass', 'the', 'and', 'for', 'with', 'age', 'kor', 'kora', 'korban']);
  const keys = q
    .split(/[^a-záéíóöőúüűa-z0-9]+/i)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 2 && !stop.has(w));
  if (!keys.length) return true;

  const title = String(item.title || '').toLowerCase();
  const summary = String(item.summary || '').toLowerCase();

  // A cím sokkal erősebb jel, mint az összefoglaló: ha a cím tartalmaz egy
  // kulcsszót, a forrás valóban a keresett témáról szól.
  if (keys.some((k) => title.includes(k))) return true;

  // Ha csak az összefoglalóban van egyezés (pl. egy másik témájú cikk
  // mellékesen említi a keresett szót), az önmagában nem elég — legalább
  // két különböző kulcsszónak kell egyeznie, hogy tényleg a témáról szóljon.
  const summaryHits = keys.filter((k) => summary.includes(k)).length;
  if (summaryHits >= 2) return true;

  // Fordított angol alak külön ellenőrzése a címben (nem az összefoglalóban)
  const en = translate(query).toLowerCase();
  if (en && en !== q && title.includes(en.split(/\s+/)[0])) return true;

  return false;
}

export async function webSearch(q, lang) {
  if (IS_TASK.test(q)) {
    return { isTask: true, summary: '', sources: [] };
  }

  // Tiszta képkérésnél NE töltsük tele Open Library / cikkekkel
  const isPureImage =
    /(?:kép|fotó|illusztr|ábra|image|photo|picture)/i.test(q) &&
    /(?:mutass|keress|adj|show|find|need|want|kérek)/i.test(q);

  const tq = translate(q);

  const generalJobs = [
    fetch(`https://hu.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d) =>
        d.extract
          ? {
              title: d.title,
              summary: d.extract.slice(0, 500),
              url: d.content_urls?.desktop?.page,
              source: 'Wikipedia HU',
            }
          : null
      )
      .catch(() => null),

    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(tq)}`)
      .then((r) => r.json())
      .then((d) =>
        d.extract
          ? {
              title: d.title,
              summary: d.extract.slice(0, 500),
              url: d.content_urls?.desktop?.page,
              source: 'Wikipedia EN',
            }
          : null
      )
      .catch(() => null),

    fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`)
      .then((r) => r.json())
      .then((d) =>
        d.AbstractText
          ? {
              title: d.Heading || q,
              summary: d.AbstractText.slice(0, 500),
              url: d.AbstractURL,
              source: 'DuckDuckGo',
            }
          : null
      )
      .catch(() => null),
  ];

  // Csak nem-kép kérdéseknél: szakmai források + könyv
  const academicJobs = [];
  if (!isPureImage) {
    academicJobs.push(
      fetch(`https://api.openalex.org/works?search=${encodeURIComponent(tq)}&per-page=2`)
        .then((r) => r.json())
        .then((d) => {
          const w = d.results?.[0];
          return w
            ? {
                title: w.display_name,
                summary: (w.abstract_inverted_index
                  ? Object.keys(w.abstract_inverted_index).slice(0, 30).join(' ')
                  : ''
                ).slice(0, 400),
                url: w.id,
                source: 'OpenAlex',
              }
            : null;
        })
        .catch(() => null),

      fetch(
        `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(tq)}&limit=1&fields=title,abstract,url`
      )
        .then((r) => r.json())
        .then((d) => {
          const w = d?.data?.[0];
          return w
            ? {
                title: w.title,
                summary: (w.abstract || '').slice(0, 400),
                url: w.url,
                source: 'Semantic Scholar',
              }
            : null;
        })
        .catch(() => null),

      fetch(`https://api.crossref.org/works?query=${encodeURIComponent(tq)}&rows=1`)
        .then((r) => r.json())
        .then((d) => {
          const w = d?.message?.items?.[0];
          if (!w) return null;
          const title = Array.isArray(w.title) ? w.title[0] : w.title;
          const journal = Array.isArray(w['container-title']) ? w['container-title'][0] : '';
          return title
            ? {
                title,
                summary: journal || 'Szakfolyóirat cikk',
                url: w.URL,
                source: 'Crossref (szakfolyóirat)',
              }
            : null;
        })
        .catch(() => null),

      fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(tq)}&limit=1`)
        .then((r) => r.json())
        .then((d) => {
          const w = d?.docs?.[0];
          return w
            ? {
                title: w.title,
                summary: (w.author_name || []).join(', ') || 'Online könyv',
                url: `https://openlibrary.org${w.key}`,
                source: 'Open Library (könyv)',
              }
            : null;
        })
        .catch(() => null)
    );
  }

  // Az általános (Wikipédia / DuckDuckGo) találatok eleve a keresett
  // címhez tartoznak, ezeket mindig megtartjuk. A szakmai/könyv találatok
  // (OpenAlex, Semantic Scholar, Crossref, Open Library) csak akkor
  // maradnak bent, ha a relevancia-szűrő valóban a témához köti őket —
  // itt NINCS fallback visszatöltés, hogy ne kerüljön be véletlenszerű,
  // más témájú cikk csak azért, mert egy szó mellékesen egyezett.
  const generalRaw = (await Promise.all(generalJobs)).filter(Boolean);
  const academicRaw = (await Promise.all(academicJobs)).filter(Boolean);
  const relevantAcademic = academicRaw.filter((item) => isRelevantSource(item, q));
  const finalList = [...generalRaw, ...relevantAcademic];

  return {
    isTask: false,
    summary: finalList.map((r) => `[${r.source}] ${r.title}: ${r.summary}`).join('\n'),
    sources: finalList,
  };
                                                    }
