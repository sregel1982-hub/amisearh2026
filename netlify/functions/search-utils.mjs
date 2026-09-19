// V5.0 - OKOS: feladatnál nem keres geotermikus cikkeket
const IS_TASK = /(feladat|egyenlet|példa|generálj|készíts|oldj meg|gyakorló|teszt|kvíz|feladatsor)/i;

function translate(q){ /*... ugyanaz mint V4.9... */
  const map={"felvilágosodás":"Age of Enlightenment","templom":"church","korona":"Holy Crown of Hungary","ford t":"Ford Model T"};
  const low=q.toLowerCase(); for(const k in map){ if(low.includes(k)) return map[k]; } return q;
}

async function searchCommons(q){ /*... marad... */
  try{
    const r=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(translate(q))}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url&format=json&origin=*`);
    const d=await r.json(); const p=Object.values(d?.query?.pages||{})[0]; return p?.imageinfo?.[0]?{url:p.imageinfo[0].url,title:p.title,source:"Wikimedia Commons",sourceUrl:`https://commons.wikimedia.org/wiki/${p.title}`}:null;
  }catch{return null;}
}
export async function imageSearch(q){ return await searchCommons(q); }

export async function webSearch(q, lang){
  // HA FELADAT -> NE keress tudományos cikkekben!
  if(IS_TASK.test(q)){ return {isTask:true, summary:"", sources:[]}; }

  // EGYÉBKÉNT mindenhol keres
  const jobs=[
    fetch(`https://hu.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`).then(r=>r.json()).then(d=>d.extract?{title:d.title,summary:d.extract.slice(0,500),url:d.content_urls.desktop.page,source:"Wikipedia HU"}:null).catch(()=>null),
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(translate(q))}`).then(r=>r.json()).then(d=>d.extract?{title:d.title,summary:d.extract.slice(0,500),url:d.content_urls.desktop.page,source:"Wikipedia EN"}:null).catch(()=>null),
    fetch(`https://api.openalex.org/works?search=${encodeURIComponent(translate(q))}&per-page=1`).then(r=>r.json()).then(d=>{const w=d.results?.[0]; return w?{title:w.display_name,summary:(w.abstract_inverted_index?Object.keys(w.abstract_inverted_index).slice(0,30).join(" "):"").slice(0,400),url:w.id,source:"OpenAlex"}:null}).catch(()=>null)
  ];
  const res=(await Promise.all(jobs)).filter(Boolean);
  return {isTask:false, summary:res.map(r=>`[${r.source}] ${r.title}: ${r.summary}`).join("\n"), sources:res};
}
