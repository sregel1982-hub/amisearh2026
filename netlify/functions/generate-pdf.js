// utils/generatePDF.js – AMISEARCH szép PDF generátor
// ✅ JAVÍTVA: a kép-markdown (![alt](url)) most már valódi <img>-ként jelenik meg,
//    nem szövegként folyik bele a bekezdésbe.

export function formatForExport(text) {
  if (!text) return "";

  let t = text
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // Címsorok előtt/után sortörés
    .replace(/([^\n])(#{1,6}\s+)/g, "$1\n\n$2")
    .replace(/(#{1,6}\s+[^\n]+)/g, "\n$1\n")
    // Listák előtt sortörés
    .replace(/([^\n])(\n?[•\-\*]\s+)/g, "$1\n$2")
    .replace(/([^\n])(\n?\d+\.\s+)/g, "$1\n$2")
    // Többszörös üres sorok csökkentése
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();

  return t;
}

// Markdown → egyszerű HTML (kép + címsor + lista támogatás)
function markdownToHtml(md) {
  let html = md
    // ✅ KÉP — ezt KELL elsőként lefuttatni, különben a bekezdés-szabály
    // szétszedi a "![alt](url)" szintaxist, és az url szövegként landol.
    .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, url) => {
      const safeAlt = String(alt || "").replace(/"/g, "&quot;");
      const safeUrl = String(url || "").trim();
      return `<figure class="amis-img"><img src="${safeUrl}" alt="${safeAlt}" /><figcaption>${safeAlt}</figcaption></figure>`;
    })
    // ## Címsor
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    // ### Címsor
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    // Félkövér
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Listák
    .replace(/^[•\-\*]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
    // Bekezdések
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>");

  // Listákat <ul>-be csomagoljuk
  html = html.replace(/(<li>.*?<\/li>)/gs, (match) => `<ul>${match}</ul>`);

  // Többszörös ul tisztítás
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  return `<p>${html}</p>`;
}

export default async function generatePDF(content, title = "AMISEARCH válasz") {
  const clean = formatForExport(content);
  const bodyHtml = markdownToHtml(clean);

  const html = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      font-size: 11.5pt;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      color: #c41e3a;
      font-size: 1.6em;
      margin-bottom: 8px;
      border-bottom: 2px solid #c41e3a;
      padding-bottom: 6px;
    }
    h2 {
      color: #1e3a8a;
      font-size: 1.25em;
      margin-top: 28px;
      margin-bottom: 12px;
    }
    h3 {
      color: #1e40af;
      font-size: 1.1em;
      margin-top: 20px;
      margin-bottom: 8px;
    }
    p {
      margin: 0 0 12px 0;
    }
    ul {
      margin: 8px 0 16px 0;
      padding-left: 22px;
    }
    li {
      margin-bottom: 6px;
    }
    strong {
      color: #111;
    }
    .meta {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 24px;
    }
    /* ✅ ÚJ: kép-blokk stílusa, hogy ne folyjon egybe a szöveggel */
    .amis-img {
      margin: 18px 0;
      text-align: center;
      page-break-inside: avoid;
    }
    .amis-img img {
      max-width: 100%;
      max-height: 380px;
      border-radius: 6px;
      display: block;
      margin: 0 auto;
    }
    .amis-img figcaption {
      font-size: 0.8em;
      color: #777;
      margin-top: 6px;
    }
    .footer {
      margin-top: 40px;
      font-size: 0.85em;
      color: #888;
      border-top: 1px solid #ddd;
      padding-top: 12px;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">${new Date().toLocaleString("hu-HU")}</div>
  ${bodyHtml}
  <div class="footer">
    AMISEARCH tanulási segédlet · amisearch.org
  </div>
</body>
</html>`;

  return new Blob([html], { type: "text/html;charset=utf-8" });
}
