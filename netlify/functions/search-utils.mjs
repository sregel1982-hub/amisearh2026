// search-utils.mjs V4.8 - MAGYAR FORDÍTÁS + PDF STRUKTÚRA FIX
const HU_TO_EN = {
  "felvilágosodás": "Age of Enlightenment",
  "magyar szent korona": "Holy Crown of Hungary",
  "ford t modell": "Ford Model T",
  "ford t-modell": "Ford Model T",
  "gráfelmélet": "graph theory",
  "gének": "genes DNA",
  "mohácsi vész": "Battle of Mohacs",
  "mohácsi csata": "Battle of Mohacs"
};

function translateQuery(q){
  const low = q.toLowerCase();
  for(const [hu,en] of Object.entries(HU_TO_EN)){
    if(low.includes(hu)) return en;
  }
  return q;
}

async function searchCommonsImage(query){
  // V4.8: magyar szót lefordítjuk angolra
  const enQuery = translateQuery(query);
  const tries = [enQuery, query, enQuery.split(" ")[0]];
  for(const qq of tries){
    try{
      const res = await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(qq)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`);
      if(!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages;
      if(!pages) continue;
      const page = Object.values(pages).find(p=>p.imageinfo?.[0]?.url);
      const info = page?.imageinfo?.[0];
      if(!info) continue;
      return {
        url: info.thumburl || info.url,
        title: page.title.replace(/^File:/,""),
        source: "Wikimedia Commons",
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`
      };
    }catch{}
  }
  return null;
}

export async function imageSearch(query, lang="en"){
  // sorrend: Commons -> fallback
  return await searchCommonsImage(query) ||
         await searchCommonsImage(translateQuery(query));
}

export async function webSearch(query, lang="en"){ return null; }
export async function wikipediaSearch(){ return null; }
export async function duckduckgoSearch(){ return null; }
export async function academicSearch(){ return null; }
