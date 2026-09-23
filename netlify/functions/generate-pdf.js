// utils/generatePDF.js  
// Netlify-kompatibilis, böngészőoldali PDF-nyomtatás  
// KaTeX képletek + tantárgyfüggetlen, szép A4-es tördelés  
  
function escapeHtml(value) {  
  return String(value ?? "")  
    .replace(/&/g, "&amp;")  
    .replace(/</g, "&lt;")  
    .replace(/>/g, "&gt;")  
    .replace(/"/g, "&quot;")  
    .replace(/'/g, "&#039;");  
}  
  
function escapeAttribute(value) {  
  return escapeHtml(value).replace(/`/g, "&#096;");  
}  
  
function safeUrl(value) {  
  const url = String(value || "").trim();  
  
  if (/^https?:\/\//i.test(url)) {  
    return escapeAttribute(url);  
  }  
  
  return "";  
}  
  
function normalizeText(text) {  
  return String(text || "")  
    .normalize("NFC")  
    .replace(/\r\n/g, "\n")  
    .replace(/\r/g, "\n")  
    .replace(/[ \t]+\n/g, "\n")  
    .replace(/\n{3,}/g, "\n\n")  
    .trim();  
}  
  
function formatForExport(text) {  
  let value = normalizeText(text);  
  
  // Csak a sor elején levő kötőjelet tekintjük felsorolásnak.  
  value = value.replace(  
    /(^|\n)[ \t]*[-•][ \t]+/g,  
    "$1• "  
  );  
  
  // Kiemelt címsorok előkészítése.  
  value = value.replace(  
    /(^|\n)[ \t]*(Feladat|Megoldás|Ellenőrzés|Összefoglalás|Adatok|Eredmény|Bizonyítás|Definíció|Tétel|Tulajdonságok)\s*:?[ \t]*/gi,  
    "$1### $2\n"  
  );  
  
  return value.trim();  
}  
  
function isHeading(line) {  
  return /^(Feladat|Megoldás|Ellenőrzés|Összefoglalás|Adatok|Eredmény|Bizonyítás|Definíció|Tétel|Tulajdonságok)\s*:?\s*$/i.test(  
    line  
  );  
}  
  
function isStepHeading(line) {  
  return /^\d+\.\s+[A-ZÁÉÍÓÖŐÚÜŰ]/.test(line) && line.length < 90;  
}  
  
function isMathBlock(line) {  
  const value = line.trim();  
  
  return (  
    value.startsWith("$$") ||  
    value.startsWith("\\[") ||  
    value.endsWith("$$") ||  
    value.endsWith("\\]") ||  
    value.includes("\\begin{") ||  
    value.includes("\\frac") ||  
    value.includes("\\sqrt") ||  
    value.includes("\\sum") ||  
    value.includes("\\int") ||  
    value.includes("\\cdot") ||  
    /^\s*[+\-]?\s*\d+\s*\/\s*\d+\s*$/.test(value) ||  
    /^\s*\d+\s+\d+\s*\/\s*\d+\s*$/.test(value)  
  );  
}  
  
function cleanMathDelimiters(value) {  
  return String(value || "")  
    .replace(/^\s*\$\$\s*/, "")  
    .replace(/\s*\$\$\s*$/, "")  
    .replace(/^\s*\\\[\s*/, "")  
    .replace(/\s*\\\]\s*$/, "")  
    .trim();  
}  
  
function renderInlineText(value) {  
  let text = String(value || "");  
  
  // Képek feldolgozása még escape-elés előtt.  
  const imageTokens = [];  
  
  text = text.replace(  
    /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi,  
    (_, alt, url) => {  
      const safeImage = safeUrl(url);  
  
      if (!safeImage) {  
        return escapeHtml(alt);  
      }  
  
      const token = `@@IMAGE_${imageTokens.length}@@`;  
  
      imageTokens.push(  
        `<figure class="inline-figure">  
          <img src="${safeImage}" alt="${escapeAttribute(alt)}">  
          <figcaption>${escapeHtml(alt)}</figcaption>  
        </figure>`  
      );  
  
      return token;  
    }  
  );  
  
  // A LaTeX-képleteket védeni kell escape-elés előtt.  
  const mathTokens = [];  
  
  text = text.replace(  
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g,  
    (match) => {  
      const display =  
        match.startsWith("$$") ||  
        match.startsWith("\\[");  
  
      const formula = match  
        .replace(/^\$\$|\$\$$/g, "")  
        .replace(/^\\\[|\\\]$/g, "")  
        .replace(/^\\\(|\\\)$/g, "")  
        .replace(/^\$|\$$/g, "")  
        .trim();  
  
      const token = `@@MATH_${mathTokens.length}@@`;  
  
      mathTokens.push({  
        token,  
        formula,  
        display  
      });  
  
      return token;  
    }  
  );  
  
  let result = escapeHtml(text);  
  
  // Markdown félkövér.  
  result = result.replace(  
    /\*\*(.+?)\*\*/g,  
    "<strong>$1</strong>"  
  );  
  
  // Egyszerű inline tört, csak olyan esetben, amikor nincs LaTeX.  
  result = result.replace(  
    /(^|[^\w])([+\-]?\d+)\s*\/\s*(\d+)(?![\w])/g,  
    (_, before, numerator, denominator) => {  
      return `${before}  
        <span class="simple-fraction">  
          <span>${numerator}</span>  
          <span>${denominator}</span>  
        </span>`;  
    }  
  );  
  
  // A védett matematikai helyek visszahelyezése.  
  mathTokens.forEach(({ token, formula, display }) => {  
    const className = display  
      ? "math-placeholder math-display"  
      : "math-placeholder math-inline";  
  
    const encodedFormula = encodeURIComponent(formula);  
  
    result = result.replace(  
      token,  
      `<span  
        class="${className}"  
        data-formula="${encodedFormula}"  
      ></span>`  
    );  
  });  
  
  // Képek visszahelyezése.  
  imageTokens.forEach((imageHtml, index) => {  
    result = result.replace(`@@IMAGE_${index}@@`, imageHtml);  
  });  
  
  return result;  
}  
  
function createHtmlFromText(rawText) {  
  const text = formatForExport(rawText);  
  const lines = text.split("\n");  
  
  let html = "";  
  let paragraph = [];  
  let listItems = [];  
  
  function flushParagraph() {  
    if (!paragraph.length) return;  
  
    const content = paragraph.join(" ").trim();  
  
    if (content) {  
      html += `<p>${renderInlineText(content)}</p>`;  
    }  
  
    paragraph = [];  
  }  
  
  function flushList() {  
    if (!listItems.length) return;  
  
    html += `  
      <ul class="answer-list">  
        ${listItems  
          .map((item) => `<li>${renderInlineText(item)}</li>`)  
          .join("")}  
      </ul>  
    `;  
  
    listItems = [];  
  }  
  
  for (let index = 0; index < lines.length; index += 1) {  
    const line = lines[index].trim();  
  
    if (!line) {  
      flushParagraph();  
      flushList();  
      continue;  
    }  
  
    // ### Címsor  
    if (line.startsWith("### ")) {  
      flushParagraph();  
      flushList();  
  
      const title = line.replace(/^###\s*/, "").trim();  
  
      html += `  
        <h2 class="section-heading">  
          ${renderInlineText(title)}  
        </h2>  
      `;  
  
      continue;  
    }  
  
    // Klasszikus címsor  
    if (isHeading(line)) {  
      flushParagraph();  
      flushList();  
  
      html += `  
        <h2 class="section-heading">  
          ${renderInlineText(line.replace(/:$/, ""))}  
        </h2>  
      `;  
  
      continue;  
    }  
  
    // Lépés / alpont  
    if (isStepHeading(line)) {  
      flushParagraph();  
      flushList();  
  
      html += `  
        <h3 class="step-heading">  
          ${renderInlineText(line)}  
        </h3>  
      `;  
  
      continue;  
    }  
  
    // Felsorolás  
    if (line.startsWith("•")) {  
      flushParagraph();  
  
      listItems.push(line.replace(/^•\s*/, ""));  
      continue;  
    }  
  
    // Különálló matematikai blokk  
    if (isMathBlock(line)) {  
      flushParagraph();  
      flushList();  
  
      const formula = cleanMathDelimiters(line);  
      const encodedFormula = encodeURIComponent(formula);  
  
      html += `  
        <div class="math-block">  
          <span  
            class="math-placeholder math-display"  
            data-formula="${encodedFormula}"  
          ></span>  
        </div>  
      `;  
  
      continue;  
    }  
  
    // Hosszú szövegek kezelése.  
    paragraph.push(line);  
  
    if (paragraph.join(" ").length > 700) {  
      flushParagraph();  
    }  
  }  
  
  flushParagraph();  
  flushList();  
  
  return html;  
}  
  
function createStyles() {  
  return `  
    :root {  
      --blue: #2563eb;  
      --blue-dark: #1e3a8a;  
      --blue-light: #dbeafe;  
      --green: #059669;  
      --green-light: #ecfdf5;  
      --red: #e11d48;  
      --gray-50: #f8fafc;  
      --gray-100: #f1f5f9;  
      --gray-200: #e2e8f0;  
      --gray-600: #475569;  
      --gray-800: #1e293b;  
    }  
  
    * {  
      box-sizing: border-box;  
    }  
  
    html,  
    body {  
      margin: 0;  
      padding: 0;  
      background: #ffffff;  
    }  
  
    body {  
      color: var(--gray-800);  
      font-family:  
        Inter,  
        "Segoe UI",  
        Roboto,  
        Arial,  
        sans-serif;  
      font-size: 11pt;  
      line-height: 1.65;  
      max-width: 820px;  
      margin: 0 auto;  
      padding: 24px;  
    }  
  
    .top {  
      color: #ffffff;  
      background:  
        linear-gradient(135deg, #2563eb 0%, #1d4ed8 55%, #1e3a8a 100%);  
      border-radius: 18px;  
      padding: 24px 28px;  
      margin-bottom: 22px;  
      box-shadow: 0 8px 22px rgba(30, 64, 175, .18);  
    }  
  
    .top h1 {  
      margin: 0;  
      font-size: 22pt;  
      line-height: 1.2;  
      letter-spacing: .3px;  
    }  
  
    .top small {  
      display: block;  
      margin-top: 8px;  
      font-size: 10pt;  
      opacity: .92;  
    }  
  
    .meta {  
      color: #64748b;  
      font-size: 8.5pt;  
      margin: 0 2px 22px;  
    }  
  
    p {  
      margin: 0 0 13px;  
      text-align: left;  
    }  
  
    .section-heading {  
      color: var(--blue-dark);  
      font-size: 15pt;  
      line-height: 1.3;  
      margin: 28px 0 14px;  
      padding: 11px 16px;  
      background: linear-gradient(90deg, var(--blue-light), transparent);  
      border-left: 5px solid var(--blue);  
      border-bottom: 1px solid #bfdbfe;  
      border-radius: 0 10px 10px 0;  
      page-break-after: avoid;  
      break-after: avoid;  
    }  
  
    .step-heading {  
      color: #4338ca;  
      font-size: 12.5pt;  
      margin: 20px 0 9px;  
      padding-bottom: 5px;  
      border-bottom: 2px solid #c7d2fe;  
      page-break-after: avoid;  
      break-after: avoid;  
    }  
  
    .answer-list {  
      margin: 10px 0 16px;  
      padding: 0;  
      list-style: none;  
    }  
  
    .answer-list li {  
      margin: 8px 0;  
      padding: 11px 14px 11px 38px;  
      background: var(--gray-50);  
      border: 1px solid var(--gray-200);  
      border-left: 4px solid var(--green);  
      border-radius: 10px;  
      position: relative;  
      page-break-inside: avoid;  
      break-inside: avoid;  
    }  
  
    .answer-list li::before {  
      content: "✓";  
      position: absolute;  
      left: 13px;  
      color: var(--green);  
      font-weight: 700;  
    }  
  
    .inline-figure {  
      margin: 16px auto;  
      text-align: center;  
      page-break-inside: avoid;  
      break-inside: avoid;  
    }  
  
    .inline-figure img {  
      max-width: 100%;  
      max-height: 440px;  
      border-radius: 10px;  
      border: 1px solid var(--gray-200);  
    }  
  
    .inline-figure figcaption {  
      color: var(--gray-600);  
      font-size: 9pt;  
      margin-top: 5px;  
    }  
  
    .math-block {  
      text-align: center;  
      margin: 18px 0;  
      padding: 18px;  
      background: #f8fafc;  
      border: 1px solid var(--gray-200);  
      border-radius: 12px;  
      page-break-inside: avoid;  
      break-inside: avoid;  
      overflow-x: auto;  
    }  
  
    .math-inline {  
      margin: 0 2px;  
    }  
  
    .simple-fraction {  
      display: inline-flex;  
      vertical-align: middle;  
      flex-direction: column;  
      align-items: center;  
      line-height: 1.05;  
      margin: 0 3px;  
    }  
  
    .simple-fraction span:first-child {  
      padding: 0 4px 2px;  
      border-bottom: 1px solid currentColor;  
    }  
  
    .simple-fraction span:last-child {  
      padding: 2px 4px 0;  
    }  
  
    .katex-display {  
      margin: .5em 0 !important;  
      overflow-x: auto;  
      overflow-y: hidden;  
    }  
  
    a {  
      color: #4338ca;  
      overflow-wrap: anywhere;  
    }  
  
    .footer {  
      color: #94a3b8;  
      font-size: 8pt;  
      text-align: center;  
      margin-top: 42px;  
      padding-top: 13px;  
      border-top: 1px solid var(--gray-200);  
    }  
  
    @media print {  
      @page {  
        size: A4;  
        margin: 16mm 17mm;  
      }  
  
      html,  
      body {  
        background: #ffffff;  
      }  
  
      body {  
        max-width: none;  
        padding: 0;  
        font-size: 10.5pt;  
      }  
  
      .top {  
        print-color-adjust: exact;  
        -webkit-print-color-adjust: exact;  
        box-shadow: none;  
      }  
  
      .section-heading,  
      .answer-list li,  
      .math-block {  
        print-color-adjust: exact;  
        -webkit-print-color-adjust: exact;  
      }  
  
      h1,  
      h2,  
      h3 {  
        page-break-after: avoid;  
        break-after: avoid;  
      }  
  
      p,  
      li {  
        orphans: 3;  
        widows: 3;  
      }  
  
      a {  
        color: inherit;  
        text-decoration: none;  
      }  
    }  
  `;  
}  
  
function createDocumentHtml({  
  body,  
  filename,  
  subject,  
  grade  
}) {  
  const subjectText = [  
    subject || "Tananyag",  
    grade ? `${grade}. évfolyam` : "",  
    "teljes megoldás"  
  ]  
    .filter(Boolean)  
    .join(" · ");  
  
  const safeFilename = escapeHtml(filename);  
  const safeSubject = escapeHtml(subjectText);  
  const date = escapeHtml(  
    new Date().toLocaleString("hu-HU")  
  );  
  
  return `<!DOCTYPE html>  
<html lang="hu">  
<head>  
  <meta charset="UTF-8">  
  <meta  
    name="viewport"  
    content="width=device-width, initial-scale=1"  
  >  
  <title>${safeFilename}</title>  
  
  <link  
    rel="stylesheet"  
    href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css"  
  >  
  
  <style>  
    ${createStyles()}  
  </style>  
</head>  
  
<body>  
  <header class="top">  
    <h1>AMISEARCH</h1>  
    <small>${safeSubject}</small>  
  </header>  
  
  <div class="meta">  
    ${date} · ${safeFilename}  
  </div>  
  
  <main>  
    ${body}  
  </main>  
  
  <footer class="footer">  
    amisearch.org · Tanulj hatékonyabban  
  </footer>  
  
  <script  
    src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"  
  ></script>  
  
  <script>  
    (function () {  
      function renderMath() {  
        if (!window.katex) {  
          setTimeout(renderMath, 100);  
          return;  
        }  
  
        var nodes = document.querySelectorAll(  
          ".math-placeholder"  
        );  
  
        nodes.forEach(function (node) {  
          var encoded = node.getAttribute("data-formula") || "";  
          var formula = "";  
  
          try {  
            formula = decodeURIComponent(encoded);  
          } catch (error) {  
            formula = encoded;  
          }  
  
          try {  
            window.katex.render(formula, node, {  
              displayMode: node.classList.contains("math-display"),  
              throwOnError: false,  
              trust: false,  
              strict: false  
            });  
          } catch (error) {  
            node.textContent = formula;  
            node.classList.add("math-error");  
          }  
        });  
  
        document.documentElement.setAttribute(  
          "data-math-ready",  
          "true"  
        );  
  
        if (document.fonts && document.fonts.ready) {  
          document.fonts.ready.then(function () {  
            setTimeout(function () {  
              window.focus();  
              window.print();  
            }, 350);  
          });  
        } else {  
          setTimeout(function () {  
            window.focus();  
            window.print();  
          }, 600);  
        }  
      }  
  
      renderMath();  
    })();  
  </script>  
</body>  
</html>`;  
}  
  
export async function downloadAsPdfFile(  
  content,  
  filename = "amisearch-valasz",  
  subject = "Tananyag",  
  grade = ""  
) {  
  console.log("[AMISEARCH] PDF-nyomtatás indul...");  
  
  const body = createHtmlFromText(content);  
  
  const html = createDocumentHtml({  
    body,  
    filename,  
    subject,  
    grade  
  });  
  
  const blob = new Blob(  
    [html],  
    { type: "text/html;charset=utf-8" }  
  );  
  
  const url = URL.createObjectURL(blob);  
  const win = window.open(url, "_blank");  
  
  if (!win) {  
    const link = document.createElement("a");  
  
    link.href = url;  
    link.download = `${filename}.html`;  
    document.body.appendChild(link);  
    link.click();  
    link.remove();  
  
    setTimeout(() => URL.revokeObjectURL(url), 5000);  
    return;  
  }  
  
  // Biztonsági tartalék, ha a CDN vagy a nyomtatási esemény lassan töltődik.  
  setTimeout(() => {  
    try {  
      if (win && !win.closed) {  
        win.focus();  
      }  
    } catch (error) {  
      console.warn("A PDF-ablak nem fókuszálható.", error);  
    }  
  }, 1200);  
}  
  
export default downloadAsPdfFile;  
          
