// utils/generatePDF.js V12 — MINDEN tört formátumot felismer
export function formatForExport(text){
  let t = String(text||"").normalize("NFC").replace(/\r/g,"\n");
  
  // 1. Felsorolás jelek új sora
  t = t.replace(/[ \t]*[-•][ \t]*/g, "\n• ");
  
  // 2. Törtek köré új sor
  t = t.replace(/(\d+\s+\d+\s*\/\s*\d+|[+\-]?\s*\d+\s*\/\s*\d+|\(\d+\)\s*\/\s*\(\d+\)|\\frac\{[^}]+\}\{[^}]+\})/g, "\n$1\n");
  
  // 3. Mondat végén nagybetűs kezdet → új bekezdés
  t = t.replace(/([.!?])\s+([A-ZÁÉÍÓÖŐÚŰA-Z])/g, "$1\n\n$2");
  
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
      html += `<p>${processLatexInText(buffer)}</p>`;
      buffer = "";
    }
  };

  // ===== MINDEN TÖRT FORMÁTUM FELDOLGOZÁSA =====
  function processLatexInText(text){
    if(!text) return "";
    let res = text;

    // 1. Vegyes tört: 3 1/4
    res = res.replace(
      /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
      (_, egesz, szam, nev) => `${egész} <span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 2. Egyszerű tört: 1/2, - 3/4, +5/6
    res = res.replace(
      /([+\-]?\s*)(\d+)\s*\/\s*(\d+)/g,
      (_, jel, szam, nev) => `${jel||""}<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 3. Zárójeles tört: (1)/(4), (13)/(4)
    res = res.replace(
      /\((\d+)\)\s*\/\s*\((\d+)\)/g,
      (_, szam, nev) => `<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 4. LaTeX szóközökkel és $-jelekkel: $ \frac{13}{4} $
    res = res.replace(
      /\$\s*\\frac\{([^}]+)\}\{([^}]+)\}\s*\$/g,
      (_, szam, nev) => `<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 5. Tiszta LaTeX: \frac{13}{4}
    res = res.replace(
      /\\frac\{([^}]+)\}\{([^}]+)\}/g,
      (_, szam, nev) => `<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // Szimbólumok
    res = res
      .replace(/\\cdot/g, "·")
      .replace(/\\div/g, "÷")
      .replace(/\\ge/g, "≥")
      .replace(/\\le/g, "≤")
      .replace(/\\infty/g, "∞")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    return res;
  }

  // ===== KÜLÖN SORBAN ÁLLÓ KÉPLETEK =====
  const vanTort = (line) => 
    /^\s*\d+\s+\d+\s*\/\s*\d+\s*$/.test(line) ||    // 3 1/4
    /^\s*[+\-]?\s*\d+\s*\/\s*\d+\s*$/.test(line) || // 1/2
    /^\s*\(\d+\)\s*\/\s*\(\d+\)\s*$/.test(line) || // (1)/(4)
    line.includes("\\frac");

  for(let line of parts){
    if(vanTort(line)){
      flushPara();
      let display = line
        .replace(/^\\\[|\\\]$/g, "")
        .replace(/^\$\$|\$\$$/g, "");

      // Vegyes szám
      display = display.replace(
        /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
        (_, egesz, szam, nev) => `${egész} <div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );

      // Egyszerű tört
      display = display.replace(
        /([+\-]?\s*)(\d+)\s*\/\s*(\d+)/g,
        (_, jel, szam, nev) => `${jel||""}<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );

      // Zárójeles
      display = display.replace(
        /\((\d+)\)\s*\/\s*\((\d+)\)/g,
        (_, szam, nev) => `<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );

      // LaTeX $ \frac{...} $
      display = display.replace(
        /\$\s*\\frac\{([^}]+)\}\{([^}]+)\}\s*\$/g,
        (_, szam, nev) => `<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );

      // Tiszta LaTeX
      display = display.replace(
        /\\frac\{([^}]+)\}\{([^}]+)\}/g,
        (_, szam, nev) => `<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );

      display = display.replace(/\\cdot/g, "·").replace(/\\div/g, "÷");
      
      html += `<div class="math-block">${display}</div>`;
      continue;
    }

    // KÉP
    const img = line.match(/!\[(.*?)\]\((.*?)\)/);
    if(img){
      flushPara();
      html += `<figure><img src="${img[2]}" alt="${img[1]}"><figcaption>${img[1]}</figcaption></figure>`;
      continue;
    }
    
    // CÍM felismerés
    const isCim = 
      line.length >= 5 && line.length <= 60 &&
      /^[A-ZÁÉÍÓÖŐÚŰA-Z]/.test(line) &&
      !/[.!?]$/.test(line) &&
      !/ [a-záéíóöőúüű]{15,}/.test(line);

    if(isCim || /^.{3,60}:$/.test(line)){
      flushPara();
      html += `<h3>${line.replace(/:$/,"")}</h3>`;
      continue;
    }
    
    // FELSOROLÁS
    if(line.startsWith("•")){
      flushPara();
      const content = line.slice(1).trim();
      const kettospont = content.indexOf(":");
      if(kettospont > 2 && kettospont < 80){
        const cim = content.slice(0,kettospont).trim();
        const szoveg = content.slice(kettospont+1).trim();
        html += `<div class="card"><strong>${processLatexInText(cim)}:</strong> ${processLatexInText(szoveg)}</div>`;
      } else {
        html += `<div class="card">${processLatexInText(content)}</div>`;
      }
      continue;
    }
    
    // SZÖVEG gyűjtése
    if(line.length > 0){
      if(buffer.length === 0) {
        buffer = line;
      } else {
        const ujBekezdes = 
          (/^[A-ZÁÉÍÓÖŐÚŰA-Z][a-záéíóöőúüű]{2,15}$/.test(line) && line.length < 20) ||
          buffer.length > 250;
        if(ujBekezdes){
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
  console.log('[AMISEARCH] PDF generálás indul...'); // Ha ez nem látszik → rossz fájl fut!
  
  const body = toBeautifulHtml(content);
  const withLinks = body.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>${filename}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  @page{margin:1.6cm 1.8cm;}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.75;font-size:11pt;max-width:750px;margin:0 auto;background:#fff;}
  
  /* === TÖRT STÍLUSOK — vízszintes vonal === */
  .frac {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    vertical-align: middle;
    margin: 0 0.2em;
    font-size: 0.9em;
  }
  .frac .num, .frac .den { padding: 0 0.25em; text-align:center; }
  .frac .bar { border-bottom: 1px solid #1e293b; width: 100%; }

  .frac-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    margin: 0.8em auto;
    font-size: 1.2em;
  }
  .frac-display .num { padding: 0 0.4em; }
  .frac-display .bar {
    border-bottom: 2px solid #4f46e5;
    width: 6em;
  }
  .frac-display .den { padding: 0 0.4em; }

  .math-block {
    text-align: center;
    margin: 1em 0;
    padding: 1em 0;
    background: #f8fafc;
    border-radius: 8px;
  }

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
