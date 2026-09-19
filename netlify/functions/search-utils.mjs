// search-utils.mjs V4.9 - ÖSSZETETT LEGÁLIS KERESÉS
const HU_TO_EN = {
  "felvilágosodás": "Age of Enlightenment",
  "templom": "church cathedral",
  "templomról": "church cathedral",
  "magyar szent korona": "Holy Crown of Hungary",
  "ford t modell": "Ford Model T",
  "gráfelmélet": "graph theory",
  "mohácsi vész": "Battle of Mohacs 1526"
};
function translate(q){ const l=q.toLowerCase(); for(const[k,v] of Object.entries(HU_TO_EN)){ if(l.includes(k)) return v; } return q; }
function stripHtml(s){ return String(s||"").replace(/<[^>]*>/g,"").trim(); }

// --- KÉPEK ---
async function searchCommons(q){
  const queries=[translate(q), q, q.split(" ").slice(0,2).join(" ")];
  for(const qq of queries){
    try{
      const r=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(qq)}&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1024&format=json&origin=*`);
      if(!r.ok) continue;
      const d=await r.json(); const pages=Object.values(d?.query?.pages||{});
      const p=pages.find(x=>x.imageinfo?.[0]?.url);
      if(!p) continue;
      const i=p.imageinfo[0];
      return {url:i.thumburl||i.url, title:p.title.replace(/^File:/,""), source:"Wikimedia Commons", sourceUrl:`https://commons.wikimedia.org/wiki/${encodeURIComponent(p.title)}`};
    }catch{}
  }
  return null;
}
async function searchUnsplash(q){
  const key=process.env.UNSPLASH_ACCESS_KEY; if(!key) return null;
  try{
    const r=await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(translate(q))}&per_page=3`,{headers:{Authorization:`Client-ID ${key}`}});
    if(!r.ok) return null; const d=await r.json(); const p=d.results?.[0]; if(!p) return null;
    return {url:p.urls.regular, title:p.alt_description||p.description||"Unsplash", source:"Unsplash", sourceUrl:p.links.html};
  }catch{ return null; }
}
async function searchPexels(q){
  const key=process.env.PEXELS_API_KEY; if(!key) return null;
  try{
    const r=await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(translate(q))}&per_page=3`,{headers:{Authorization:key}});
    if(!r.ok) return null; const d=await r.json(); const p=d.photos?.[0]; if(!p) return null;
    return {url:p.src.large, title:p.alt||"Pexels", source:"Pexels", sourceUrl:p.url};
  }catch{ return null; }
}
async function searchPixabay(q){
  const key=process.env.PIXABAY_API_KEY; if(!key) return null;
  try{
    const r=await fetch(`https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(translate(q))}&image_type=photo&per_page=3`);
    if(!r.ok) return null; const d=await r.json(); const p=d.hits?.[0]; if(!p) return null;
    return {url:p.webformatURL, title:p.tags, source:"Pixabay", sourceUrl:p.pageURL};
  }catch{ return null; }
}
export async function imageSearch(query, lang="hu"){
  return await searchCommons(query) || await searchUnsplash(query) || await searchPexels(query) || await searchPixabay(query);
}

// --- SZÖVEGES FORRÁSOK ---
async function searchWiki(q, lang){
  try{
    const l=lang.startsWith("hu")?"hu":"en";
    const r=await fetch(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
    if(!r.ok) return null; const d=await r.json(); if(!d.extract) return null;
    return {title:d.title, summary:d.extract, url:d.content_urls.desktop.page, source:`Wikipedia (${l})`};
  }catch{ return null; }
}
async function searchOpenAlex(q){
  try{
    const r=await fetch(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=2`);
    if(!r.ok) return null; const d=await r.json(); const w=d.results?.[0]; if(!w) return null;
    let abs=""; if(w.abstract_inverted_index){ abs=Object.entries(w.abstract_inverted_index).flatMap(([wd,ps])=>ps.map(p=>({wd,p}))).sort((a,b)=>a.p-b.p).map(x=>x.wd).join(" "); }
    if(!abs) return null;
    return {title:w.display_name, summary:abs.slice(0,600), url:w.doi||w.id, source:"OpenAlex"};
  }catch{ return null; }
}
async function searchSemantic(q){
  try{
    const r=await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(q)}&limit=2&fields=title,abstract,url`);
    if(!r.ok) return null; const d=await r.json(); const p=d.data?.[0]; if(!p?.abstract) return null;
    return {title:p.title, summary:p.abstract.slice(0,600), url:p.url, source:"Semantic Scholar"};
  }catch{ return null; }
}
async function searchArxiv(q){
  if(/irodalom|történelem|pedagógia|mohács|templom|felvilágosodás|korona|ford t/i.test(q)) return null;
  try{
    const r=await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q)}&max_results=2`);
    if(!r.ok) return null; const xml=await r.text();
    const title=xml.match(/<title>(?!ArXiv)([^<]+)<\/title>/)?.[1];
    const sum=xml.match(/<summary>([^<]+)<\/summary>/)?.[1];
    const link=xml.match(/<id>(https[^<]+)<\/id>/)?.[1];
    if(!title||!sum) return null;
    return {title:title.trim(), summary:sum.trim().slice(0,600), url:link, source:"arXiv"};
  }catch{ return null; }
}
async function searchDuck(q){
  try{
    const r=await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1`);
    if(!r.ok) return null; const d=await r.json(); if(!d.AbstractText) return null;
    return {title:d.Heading||q, summary:d.AbstractText.slice(0,600), url:d.AbstractURL, source:"DuckDuckGo"};
  }catch{ return null; }
}

export async function webSearch(query, lang="hu"){
  const q=translate(query);
  const promises=[searchWiki(query, lang), searchWiki(q,"en"), searchOpenAlex(q), searchSemantic(q), searchArxiv(q), searchDuck(q)];
  const results=(await Promise.allSettled(promises)).map(r=>r.status==="fulfilled"?r.value:null).filter(Boolean);
  if(results.length===0) return null;
  return {
    summary: results.map(r=>`[${r.source}] ${r.title}: ${r.summary}`).join("\n\n"),
    sources: results,
    source: results.map(r=>r.source).join(", ")
  };
            }
