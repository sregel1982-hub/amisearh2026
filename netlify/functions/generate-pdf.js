// utils/generatePDF.js V13 — TELJES LaTeX + KIEMELT CÍMSOROK
export function formatForExport(text){
  let t = String(text||"").normalize("NFC").replace(/\r/g,"\n");
  
  // 1. Felsorolás jelek új sora
  t = t.replace(/[ \t]*[-•][ \t]*/g, "\n• ");
  
  // 2. LaTeX blokkok és törtek új sora
  t = t.replace(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\frac\{[^}]+\}\{[^}]+\}|\d+\s+\d+\s*\/\s*\d+|[+\-]?\s*\d+\s*\/\s*\d+)/g, "\n$1\n");
  
  // 3. Címsorok felismerése és új sorba emelése
  t = t.replace(/(^|\n)(\d+\.\s+Lépés|Megoldás|Ellenőrzés|Összefoglalás|Feladat|Adatok|Eredmény|Bizonyítás|Definíció|Tétel|Tulajdonságok)\b/g, "$1\n### $2");
  
  // 4. Mondat végén nagybetűs kezdet → új bekezdés
  t = t.replace(/([.!?])\s+([A-ZÁÉÍÓÖŐÚŰA-Z])/g, "$1\n\n$2");
  
  // 5. Tiszta sortörések
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

  // ===== LaTeX ÉS MATEMATIKAI KIFEJEZÉSEK FELDOLGOZÁSA =====
  function processLatexInText(text){
    if(!text) return "";
    let res = text;

    // 1. Vegyes tört: 3 1/4
    res = res.replace(
      /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
      (_, egesz, szam, nev) => `${egesz} <span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 2. Egyszerű tört: 1/2, - 3/4
    res = res.replace(
      /([+\-]?\s*)(\d+)\s*\/\s*(\d+)/g,
      (_, jel, szam, nev) => `${jel||""}<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 3. Zárójeles tört: (1)/(4)
    res = res.replace(
      /\((\d+)\)\s*\/\s*\((\d+)\)/g,
      (_, szam, nev) => `<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // 4. LaTeX — soron belüli: $ \frac{13}{4} $, $x_1$
    res = res.replace(
      /\$([^$]+)\$/g,
      (_, formula) => processLatexInline(formula)
    );

    // 5. Tiszta \frac
    res = res.replace(
      /\\frac\{([^}]+)\}\{([^}]+)\}/g,
      (_, szam, nev) => `<span class="frac"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></span>`
    );

    // Szimbólumok és indexek
    res = processLatexSymbols(res);
    res = res.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    return res;
  }

  // LaTeX szimbólumok, indexek, hatványok feldolgozása
  function processLatexSymbols(str){
    return str
      .replace(/_([a-zA-Z0-9])/g, "<sub>$1</sub>")          // x_1 → x₁
      .replace(/_\{([^}]+)\}/g, "<sub>$1</sub>")           // x_{12} → x₁₂
      .replace(/\^([a-zA-Z0-9])/g, "<sup>$1</sup>")        // x^2 → x²
      .replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>")          // x^{2+y} → x²⁺ʸ
      .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")              // √
      .replace(/\\sqrt/g, "√")
      .replace(/\\cdot/g, "·")
      .replace(/\\times/g, "×")
      .replace(/\\div/g, "÷")
      .replace(/\\pm/g, "±")
      .replace(/\\mp/g, "∓")
      .replace(/\\ge/g, "≥")
      .replace(/\\le/g, "≤")
      .replace(/\\neq/g, "≠")
      .replace(/\\approx/g, "≈")
      .replace(/\\infty/g, "∞")
      .replace(/\\sum/g, "∑")
      .replace(/\\prod/g, "∏")
      .replace(/\\int/g, "∫")
      .replace(/\\partial/g, "∂")
      .replace(/\\alpha/g, "α")
      .replace(/\\beta/g, "β")
      .replace(/\\gamma/g, "γ")
      .replace(/\\delta/g, "δ")
      .replace(/\\Delta/g, "Δ")
      .replace(/\\pi/g, "π")
      .replace(/\\theta/g, "θ")
      .replace(/\\lambda/g, "λ")
      .replace(/\\mu/g, "μ")
      .replace(/\\rho/g, "ρ")
      .replace(/\\sigma/g, "σ")
      .replace(/\\tau/g, "τ")
      .replace(/\\phi/g, "φ")
      .replace(/\\psi/g, "ψ")
      .replace(/\\omega/g, "ω")
      .replace(/\\Omega/g, "Ω")
      .replace(/\\to/g, "→")
      .replace(/\\rightarrow/g, "→")
      .replace(/\\Rightarrow/g, "⇒")
      .replace(/\\Leftrightarrow/g, "⇔")
      .replace(/\\in/g, "∈")
      .replace(/\\subset/g, "⊂")
      .replace(/\\cup/g, "∪")
      .replace(/\\cap/g, "∩")
      .replace(/\\mathbb\{R\}/g, "ℝ")
      .replace(/\\mathbb\{N\}/g, "ℕ")
      .replace(/\\mathbb\{Z\}/g, "ℤ")
      .replace(/\\mathbb\{Q\}/g, "ℚ")
      .replace(/\\mathbb\{C\}/g, "ℂ");
  }

  // Soron belüli LaTeX részletes feldolgozása
  function processLatexInline(formula){
    let f = formula;
    // Tört
    f = f.replace(
      /\\frac\{([^}]+)\}\{([^}]+)\}/g,
      (_, sz, n) => `<span class="frac"><span class="num">${sz}</span><span class="bar">─</span><span class="den">${n}</span></span>`
    );
    // Szimbólumok
    f = processLatexSymbols(f);
    return `<span class="math-inline">${f}</span>`;
  }

  // ===== KÜLÖN SORBAN ÁLLÓ MATEMATIKAI KÉPLETEK =====
  function isMathBlock(line){
    return (
      line.startsWith("$$") ||
      line.startsWith("\\[") ||
      line.startsWith("\\begin") ||
      line.includes("\\frac") ||
      line.includes("\\sqrt") ||
      line.includes("\\sum") ||
      line.includes("\\int") ||
      /^\s*[+\-]?\s*\d+\s*\/\s*\d+\s*$/.test(line) ||
      /^\s*\d+\s+\d+\s*\/\s*\d+\s*$/.test(line)
    );
  }

  for(let line of parts){
    // ===== CÍMSOROK — KIEMELT, ELKÜLÖNÜLŐ =====
    if(line.startsWith("### ")){
      flushPara();
      const cim = line.replace(/^###\s+/, "");
      html += `<h2 class="section-heading">${cim}</h2>`;
      continue;
    }
    if(/^(Feladat|Megoldás|Ellenőrzés|Összefoglalás|Adatok|Eredmény|Bizonyítás|Definíció|Tétel)\s*:?$/.test(line)){
      flushPara();
      html += `<h2 class="section-heading">${line.replace(/:$/,"")}</h2>`;
      continue;
    }
    if(/^\d+\.\s+[A-ZÁÉÍÓÖŐÚŰ]/.test(line) && line.length < 50){
      flushPara();
      html += `<h3 class="step-heading">${line}</h3>`;
      continue;
    }

    // ===== MATEMATIKAI BLOKKOK =====
    if(isMathBlock(line)){
      flushPara();
      let display = line
        .replace(/^\$\$|\$\$$/g, "")
        .replace(/^\\\[|\\\]$/g, "")
        .replace(/^\\\(|\\\)$/g, "");

      // Vegyes szám
      display = display.replace(
        /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
        (_, egesz, szam, nev) => `${egesz} <div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );
      // Egyszerű tört
      display = display.replace(
        /([+\-]?\s*)(\d+)\s*\/\s*(\d+)/g,
        (_, jel, szam, nev) => `${jel||""}<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );
      // LaTeX tört
      display = display.replace(
        /\\frac\{([^}]+)\}\{([^}]+)\}/g,
        (_, szam, nev) => `<div class="frac-display"><span class="num">${szam}</span><span class="bar">─</span><span class="den">${nev}</span></div>`
      );
      // Szimbólumok
      display = processLatexSymbols(display);
      
      html += `<div class="math-block">${display}</div>`;
      continue;
    }

    // ===== KÉP =====
    const img = line.match(/!\[(.*?)\]\((.*?)\)/);
    if(img){
      flushPara();
      html += `<figure><img src="${img[2]}" alt="${img[1]}"><figcaption>${img[1]}</figcaption></figure>`;
      continue;
    }

    // ===== FELSOROLÁS =====
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

    // ===== SZÖVEG =====
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
  console.log('[AMISEARCH] PDF generálás indul...');
  
  const body = toBeautifulHtml(content);
  const withLinks = body.replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');

  const html = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>${filename}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  @page{margin:1.8cm 2cm;}
  body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.8;font-size:11pt;max-width:750px;margin:0 auto;background:#fff;}
  
  /* === CÍMSOROK — KIEMELT, ELKÜLÖNÜLŐ === */
  .section-heading {
    color: #1e40af;
    font-size: 14pt;
    font-weight: 700;
    margin: 28px 0 12px 0;
    padding: 10px 16px;
    background: linear-gradient(90deg, #dbeafe, transparent);
    border-left: 5px solid #3b82f6;
    border-radius: 0 8px 8px 0;
    border-bottom: 2px solid #bfdbfe;
  }
  .step-heading {
    color: #4f46e5;
    font-size: 12pt;
    font-weight: 600;
    margin: 20px 0 8px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid #c7d2fe;
    display: inline-block;
  }

  /* === TÖRT STÍLUSOK === */
  .math-inline {
    padding: 0 4px;
    background: #f0f9ff;
    border-radius: 4px;
  }
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
    margin: 1em auto;
    font-size: 1.3em;
  }
  .frac-display .num { padding: 0 0.4em; }
  .frac-display .bar {
    border-bottom: 2px solid #4f46e5;
    width: 6em;
  }
  .frac-display .den { padding: 0 0.4em; }

  .math-block {
    text-align: center;
    margin: 1.2em 0;
    padding: 1.2em;
    background: #f8fafc;
    border-radius: 10px;
    border: 1px solid #e2e8f0;
  }

  /* Többi stílus */
  .top{ background:linear-gradient(135deg,#e11d48,#be123c); color:white; padding:20px 24px; border-radius:14px; margin-bottom:20px;}
  .top h1{margin:0;font-size:18px;letter-spacing:0.5px;}
  .top small{opacity:0.9;}
  p{margin:0 0 0.9em 0;text-align:justify;line-height:1.8;}
  .card{ background:#f8fafc; border:1px solid #e2e8f0; border-left:4px solid #e11d48; border-radius:10px; padding:12px 14px; margin:0.8em 0; page-break-inside:avoid;}
  .card strong{color:#881337;}
  a{color:#4f46e5;word-break:break-all;text-decoration:none;border-bottom:1px dotted #a5b4fc;}
  .meta{color:#94a3b8;font-size:8.5pt;margin-bottom:16px;}
  .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:8pt;color:#94a3b8;text-align:center;}
  
  /* Alsó- és felső index */
  sub, sup { font-size: 0.75em; }
</style></head><body>
<div class="top"><h1>AMISEARCH</h1><small>Matematika · Analízis · Deriválás · Teljes megoldások</small></div>
<div class="meta">${new Date().toLocaleString("hu-HU")} • ${filename}</div>
${withLinks}
<div class="footer">amisearch.org • Tanulj hatékonyabban</div>
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

