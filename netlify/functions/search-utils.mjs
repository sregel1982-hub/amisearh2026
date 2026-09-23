const COMMONS_UA="AMISEARCH/1.0 (https://amisearch.org; info@amisearch.app)";
async function searchCommonsImage(query){
  try{
    const r=await fetch(`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=800&format=json&origin=*`,{headers:{"User-Agent":COMMONS_UA,"Accept":"application/json"}});
    if(!r.ok){ console.error("[search-utils] Commons",r.status); return null; }
    const d=await r.json(); const pages=d?.query?.pages; if(!pages) return null;
    const all=Object.values(pages).sort((a,b)=>(a.index||99)-(b.index||99));
    const page=all.find(p=>p?.imageinfo?.[0]) || all[0];
    const info=page?.imageinfo?.[0]; if(!info) return null;
    
