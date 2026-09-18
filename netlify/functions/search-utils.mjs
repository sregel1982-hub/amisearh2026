import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function detectLanguage(text) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `Detect language ISO code only (hu,en,de...): "${text}"` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 5 }
    });
    const lang = result?.text?.trim()?.toLowerCase() || "en";
    return lang.match(/^[a-z]{2}$/)? lang : "en";
  } catch { return "en"; }
}

const ARXIV_TOPICS = ["math","physics","computer","ai","machine learning","neural","algorithm","quantum","biology","chemistry","statistics","matematika","fizika"];
const NON_ARXIV_TOPICS = ["irodalom","pedagógia","történelem","jog","szociológia","pszichológia","művészet","philosophy","religion","politics","marketing"];
function isArxivWorthy(q){ const t=q.toLowerCase(); if(NON_ARXIV_TOPICS.some(x=>t.includes(x))) return false; if(ARXIV_TOPICS.some(x=>t.includes(x))) return true; return false; }

async function searchSemanticScholar(query){ try{ const r=await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=1&fields=title,abstract,year,authors,url`); if(!r.ok) return null; const d=await r.json(); const p=d?.data?.[0]; if(!p?.abstract) return null; return {title:p.title,summary:p.abstract,url:p.url,source:"Semantic Scholar"}; }catch{ return null; } }
async function searchCORE(query){ const key=process.env.CORE_API_KEY; if(!key) return null; try{ const r=await fetch(`https://core.ac.uk:443/api-v2/articles/search/${encodeURIComponent(query)}?page=1&pageSize=1&apiKey=${key}`); if(!r.ok) return null; const d=await r.json(); const p=d?.data?.[0]; if(!p) return null; return {title:p.title,summary:p.abstract,url:p.downloadUrl||p.fullTextIdentifier,source:"CORE"}; }catch{ return null; } }
async function searchArxiv(query){ if(!isArxivWorthy(query)) return null; try{ const r=await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=1`); if(!r.ok) return null; const xml=await r.text(); const title=xml.match(/<title>(?!ArXiv)([^<]+)<\/title>/)?.[1]; const summary=xml.match(/<summary>([^<]+)<\/summary>/)?.[1]; const link=xml.match(/<id>(https[^<]+)<\/id>/)?.[1]; if(!title||!summary) return null; return {title:title.trim(),summary:summary.trim(),url:link,source:"arXiv"}; }catch{ return null; } }
async function searchOpenAlex(query){ try{ const r=await fetch(`https://api.openalex.org/works?filter=title.search:${encodeURIComponent(query)}&per-page=1`); if(!r.ok) return null; const d=await r.json(); const w=d?.results?.[0]; if(!w) return null; const abstract=w.abstract_inverted_index?Object.entries(w.abstract_inverted_index).flatMap(([word,positions])=>positions.map(pos=>({word,pos}))).sort((a,b)=>a.pos-b.pos).map(x=>x.word).join(" "):""; if(!abstract) return null; return {title:w.display_name,summary:abstract,url:w.id,source:"OpenAlex"}; }catch{ return null; } }
export async function academicSearch(query){ return await searchSemanticScholar(query) || await searchCORE(query) || await searchArxiv(query) || await searchOpenAlex(query); }
export async function wikipediaSearch(query, lang="en"){ try{ const r=await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`); if(!r.ok) return null; const d=await r.json(); if(!d?.extract) return null; return {title:d.title,summary:d.extract,url:d.content_urls?.desktop?.page,source:`Wikipedia (${lang})`}; }catch{ return null; } }
export async function duckduckgoSearch(query){ try{ const r=await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&no_redirect=1`); if(!r.ok) return null; const d=await r.json(); if(!d?.AbstractText) return null; return {title:d.Heading||query,summary:d.AbstractText,url:d.AbstractURL,source:"DuckDuckGo"}; }catch{ return null; } }
export async function webSearch(query, lang="en"){
  const [academic,wiki,ddg]=await Promise.allSettled([ academicSearch(query), wikipediaSearch(query,lang), duckduckgoSearch(query) ]);
  const results=[ academic.status==="fulfilled"?academic.value:null, wiki.status==="fulfilled"?wiki.value:null, ddg.status==="fulfilled"?ddg.value:null ].filter(Boolean);
  if(results.length===0) return null;
  return { summary: results.map(r=>`[${r.source}] ${r.title}\n${r.summary}`).join("\n\n---\n\n"), url: results[0].url, source: results.map(r=>r.source).join(", "), sources: results };
}
function stripHtml(v){ return String(v||"").replace(/<[^>]*>/g,"").trim(); }
async function searchCommonsImage(query){
  try{
    const r=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`);
    if(!r.ok) return null; const d=await r.json(); const pages=d?.query?.pages; if(!pages) return null; const page=Object.values(pages)[0]; const info=page?.imageinfo?.[0]; if(!info) return null;
    return { url: info.thumburl||info.url, title: page.title.replace(/^File:/,""), artist: stripHtml(info.extmetadata?.Artist?.value), license: stripHtml(info.extmetadata?.LicenseShortName?.value), source: "Wikimedia Commons", sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}` };
  }catch{ return null; }
}
async function searchUnsplashImage(query){ const key=process.env.UNSPLASH_ACCESS_KEY; if(!key) return null; try{ const r=await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1`,{headers:{Authorization:`Client-ID ${key}`}}); if(!r.ok) return null; const d=await r.json(); const p=d?.results?.[0]; if(!p) return null; return {url:p.urls?.regular,title:p.description||p.alt_description||"Unsplash",source:"Unsplash",sourceUrl:p.links?.html}; }catch{ return null; } }
async function searchPexelsImage(query){ const key=process.env.PEXELS_API_KEY; if(!key) return null; try{ const r=await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1`,{headers:{Authorization:key}}); if(!r.ok) return null; const d=await r.json(); const p=d?.photos?.[0]; if(!p) return null; return {url:p.src?.medium||p.src?.original,title:p.alt||"Pexels",source:"Pexels",sourceUrl:p.url}; }catch{ return null; } }
async function searchPixabayImage(query){ const key=process.env.PIXABAY_API_KEY; if(!key) return null; try{ const r=await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&per_page=1`); if(!r.ok) return null; const d=await r.json(); const p=d?.hits?.[0]; if(!p) return null; return {url:p.webformatURL,title:p.tags,source:"Pixabay",sourceUrl:p.pageURL}; }catch{ return null; } }
export async function imageSearch(query, lang="en"){
  // lang param elfogadva a chat.js miatt
  return await searchCommonsImage(query) || await searchUnsplashImage(query) || await searchPexelsImage(query) || await searchPixabayImage(query);
}
