// utils/generatePDF.js V6 - SZÉP PDF, látássérült barát
export function formatForExport(text){
  let t = String(text||"").normalize("NFC").replace(/\r/g,"\n");
  // a te hibád itt volt: a • nem kapott új sort
  t = t.replace(/\s*•\s*/g, "\n• ");
  t = t.replace(/([a-záéíóöőúüű)])([A-ZÁÉÍÓÖŐÚÜ])/g, "$1\n\n$2");
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
      buffer="";
    }
  };

  for(let line of parts){
    // KÉP![...](url)
    const img = line.match(/!\[(.*?)\]\((.*?)\)/);
    if(img){
      flushPara();
      html += `<figure><img src="${img[2]}" alt="${img[1]}"><figcaption>${img[1]}</figcaption></figure>`;
      continue;
    }
    // SZEKCIÓ cím, ha tartalmaz :: vagy nagybetűs és rövid
    if(/^.{3,60}:$/.test(line) || /^(Történelmi|Kulturális|Egyéb|Forrás|Irány)/i.test(line) && line.length<80 &&!line.startsWith("•")){
      flushPara();
      html += `<h3>${line.replace(/:$/,"")}</h3>`;
      continue;
    }
    // BULLET
    if(line.startsWith("•")){
      flushPara();
      const content = line.slice(1).trim();
      const colon = content.indexOf(":");
      if(colon>2 && colon<80){
        const title = content.slice(0,colon).trim();
        const desc = content.slice(colon+1).trim();
        html += `<div class="card"><strong>${title}:</strong> ${desc.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</div>`;
      } else {
        html += `<div class="card">${content.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>")}</div>`;
      }
      continue;
    }
    // Sima szöveg – gyűjtjük bekezdésbe
    buffer += (buffer?" ":"") + line;
    if(buffer.length>300){ flushPara(); }
  }
  flushPara();
  return html;
}

export async function downloadAsPdfFile(content, filename="amisearch-valasz"){
  const body = toBeautifulHtml(content);

  // Linkek szépítése – a nyers https://...-eket kattinthatóvá tesszük, de nem hagyjuk egybe
  const withLinks = body.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>${filename}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  @page{margin:1.6cm 1.8cm;}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.75;font-size:11pt;max-width:750px;margin:0 auto;background:#fff;}
 .top{ background:linear-gradient(135deg,#e11d48,#be123c); color:white; padding:18px 22px; border-radius:14px; margin-bottom:18px;}
 .top h1{margin:0;font-size:18px;letter-spacing:0.5px;}.top small{opacity:0.9;}
  h2{color:#be123c;font-size:16pt;margin:26px 0 10px 0;border-bottom:2px solid #ffe4e6;padding-bottom:6px;}
  h3{color:#4f46e5;font-size:12.5pt;margin:22px 0 8px 0;background:#eef2ff;padding:6px 10px;border-radius:8px;border-left:4px solid #4f46e5;}
  p{margin:8px 0 12px 0;text-align:justify;}
 .card{ background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #e11d48; border-radius:10px; padding:10px 12px; margin:10px 0; page-break-inside:avoid;}
 .card strong{color:#881337;}
  figure{margin:18px 0;text-align:center;page-break-inside:avoid;} figure img{max-width:100%;max-height:380px;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.12);} figcaption{font-size:8.5pt;color:#64748b;margin-top:6px;}
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
