// utils/generatePDF.js V9 — BÁRMELYIK SZÖVEGNÉL MŰKÖDIK, előre megadott lista NÉLKÜL
export function formatForExport(text){
  let t = String(text||"").normalize("NFC").replace(/\r/g,"\n");
  
  // 1. Felsorolás jelek mindig új sort kapjanak
  t = t.replace(/[ \t]*[-•][ \t]*/g, "\n• ");
  
  // 2. Mondat végén nagybetűs kezdet → új bekezdés
  t = t.replace(/([.!?])\s+([A-ZÁÉÍÓÖŐÚŰ])/g, "$1\n\n$2");
  
  // 3. Mintázat: Nagybetűs szó, 3-40 betű, nincs benne írásjel → valószínűleg CÍM
  // Ez a lényeg: BÁRMELYIK szövegben felismeri a fejezetcímeket
  t = t.replace(/([.!?])\s+([A-ZÁÉÍÓÖŐÚŰ][a-záéíóöőúüűA-ZÁÉÍÓÖŐÚŰ\s]{3,40})(?=\s+[A-ZÁÉÍÓÖŐÚŰ][a-záéíóöőúüű])/g, "$1\n\n$2\n");
  
  // 4. Tiszta sortörések
  t = t.replace(/\n{3,}/g, "\n\n");
  
  return t.trim();
}

function toBeautifulHtml(raw){
  const txt = formatForExport(raw);
  const parts = txt.split("\n").map(s=>s.trim()).filter(Boolean);

  let html = "";
  let buffer = "";

  const flushPara = () => {
    if(buffer){
      html += `<p>${buffer.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</p>`;
      buffer = "";
    }
  };

  for(let line of parts){
    // KÉP
    const img = line.match(/!\[(.*?)\]\((.*?)\)/);
    if(img){
      flushPara();
      html += `<figure><img src="${img[2]}" alt="${img[1]}"><figcaption>${img[1]}</figcaption></figure>`;
      continue;
    }
    
    // ✅ CÍM FELISMERÉS — BÁRMELYIK, előre lista nélkül
    // Ha: 5-60 betű, nagybetűvel kezdődik, NEM végződik írásjellel, NEM tartalmaz mondatvégi jelet → CÍM
    const isLikelyHeading = 
      line.length >= 5 && line.length <= 60 &&
      /^[A-ZÁÉÍÓÖŐÚŰ]/.test(line) &&
      !/[.!?]$/.test(line) &&
      !/ [a-záéíóöőúüű]{15,}/.test(line); // Ha túl hosszú kisbetűs rész → nem cím

    if(isLikelyHeading || /^.{3,60}:$/.test(line)){
      flushPara();
      html += `<h3>${line.replace(/:$/,"")}</h3>`;
      continue;
    }
    
    // FELSOROLÁS
    if(line.startsWith("•")){
      flushPara();
      const content = line.slice(1).trim();
      const colon = content.indexOf(":");
      if(colon > 2 && colon < 80){
        const title = content.slice(0,colon).trim();
        const desc = content.slice(colon+1).trim();
        html += `<div class="card"><strong>${title}:</strong> ${desc.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</div>`;
      } else {
        html += `<div class="card">${content.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</div>`;
      }
      continue;
    }
    
    // SZÖVEG — ésszerű darabolás
    if(line.length > 0){
      if(buffer.length === 0) {
        buffer = line;
      } else {
        // Ha új egység kezdődik → lezárjuk
        if((/^[A-ZÁÉÍÓÖŐÚŰ][a-záéíóöőúüű]{2,15}$/.test(line) && line.length < 20) || buffer.length > 250) {
          flushPara();
          buffer = line;
        } else {
          buffer += " " + line;
        }
      }
    }
  }
  flushPara();
  return html;
}

export async function downloadAsPdfFile(content, filename="amisearch-valasz"){
  const body = toBeautifulHtml(content);
  const withLinks = body.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>${filename}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  @page{margin:1.6cm 1.8cm;}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.75;font-size:11pt;max-width:750px;margin:0 auto;background:#fff;}
  .top{ background:linear-gradient(135deg,#e11d48,#be123c); color:white; padding:18px 22px; border-radius:14px; margin-bottom:18px;}
  .top h1{margin:0;font-size:18px;letter-spacing:0.5px;}
  .top small{opacity:0.9;}
  h3{color:#4f46e5;font-size:12.5pt;margin:22px 0 8px 0;background:#eef2ff;padding:6px 10px;border-radius:8px;border-left:4px solid #4f46e5;}
  p{margin:0 0 0.8em 0;text-align:justify;line-height:1.7;}
  .card{ background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #e11d48; border-radius:10px; padding:10px 12px; margin:0.7em 0; page-break-inside:avoid;}
  .card strong{color:#881337;}
  a{color:#4f46e5;word-break:break-all;text-decoration:none;border-bottom:1px dotted #a5b4fc;}
  .meta{color:#94a3b8;font-size:8.5pt;margin-bottom:14px;}
  .footer{margin-top:30px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:8pt;color:#94a3b8;text-align:center;}
</style></head><body>
<div class="top"><h1>AMISEARCH</h1><small>AMISEARCH tanulási segédlet – AI Tutor válasz</small></div>
<div class="meta">${new Date().toLocaleString("hu-HU")} • ${filename}</div>
${withLinks}
<div class="footer">amisearch.org • generálva: ${new Date().toLocaleDateString("hu-HU")}</div>
</body></html>`;

  const blob = new Blob([html],{type:"text/html;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const win = window.open(url,"_blank");
  if(win){
    win.onload=()=>{ setTimeout(()=>win.print(),900); };
  } else {
    const a=document.createElement("a"); a.href=url; a.download=filename+".html"; a.click();
  }
}

export default downloadAsPdfFile;
