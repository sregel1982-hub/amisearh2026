// utils/generatePDF.js – AMISEARCH V5 FIX
// Megtartja: címsorok, bullet lista, félkövér, képek

export function formatForExport(text) {
  if (!text) return "";
  let t = String(text).normalize("NFC");
  // a te hibád itt volt: a • jelek nem kaptak új sort
  t = t.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // képek külön sorba
  t = t.replace(/([^\n])(!\[.*?\]\(.*?\))/g, "$1\n\n$2\n\n");
  // címsorok külön sorba
  t = t.replace(/([^\n])(#{1,6}\s+)/g, "$1\n\n$2");
  t = t.replace(/(#{1,6}[^\n]+)([^\n])/g, "$1\n\n$2");
  // bullet pontok külön sorba
  t = t.replace(/([^\n])(\s*[•\-\*]\s+)/g, "$1\n$2");
  t = t.replace(/([^\n])(\s*\d+\.\s+)/g, "$1\n$2");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

function mdToHtmlBlocks(md) {
  const clean = formatForExport(md);
  const lines = clean.split("\n");
  let html = "";
  let inList = false;

  const flushList = () => {
    if (inList) { html += "</ul>\n"; inList = false; }
  };

  for (let raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }

    // KÉP:![alt](url)
    const imgMatch = line.match(/!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
      flushList();
      const alt = imgMatch[1].replace(/"/g, "&quot;");
      const url = imgMatch[2].trim();
      html += `<figure class="amis-img"><img src="${url}" alt="${alt}" crossorigin="anonymous"><figcaption>${alt}</figcaption></figure>\n`;
      continue;
    }

    // CÍMSOR ## vagy ###
    if (/^#{2,3}\s+/.test(line)) {
      flushList();
      const level = line.startsWith("###")? "h3" : "h2";
      const text = line.replace(/^#{2,3}\s+/, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<${level}>${text}</${level}>\n`;
      continue;
    }

    // BULLET: • vagy - vagy *
    if (/^[•\-\*]\s+/.test(line)) {
      if (!inList) { html += "<ul>\n"; inList = true; }
      const text = line.replace(/^[•\-\*]\s+/, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<li>${text}</li>\n`;
      continue;
    }

    // Számozott lista
    if (/^\d+\.\s+/.test(line)) {
      if (!inList) { html += "<ul>\n"; inList = true; }
      const text = line.replace(/^\d+\.\s+/, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html += `<li>${text}</li>\n`;
      continue;
    }

    // Sima bekezdés
    flushList();
    const text = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html += `<p>${text}</p>\n`;
  }
  flushList();
  return html;
}

export default async function generatePDF(content, title = "AMISEARCH válasz") {
  const bodyHtml = mdToHtmlBlocks(content);

  const fullHtml = `<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page{margin:1.8cm;} body{font-family:"Segoe UI",Arial,sans-serif;line-height:1.65;color:#1a1a1a;font-size:11.5pt;max-width:780px;margin:0 auto;word-break:break-word;}
  h2{color:#4f46e5;font-size:16pt;margin:22px 0 8px 0;padding:0;border:none;}
  h3{color:#3730a3;font-size:13pt;margin:18px 0 6px 0;}
  p{margin:0 0 10px 0;}
  ul{margin:6px 0 14px 20px;padding:0;}
  li{margin-bottom:5px;}
  strong{font-weight:700;}
 .amis-img{margin:16px 0;text-align:center;page-break-inside:avoid;}
 .amis-img img{max-width:100%;max-height:360px;border-radius:8px;display:block;margin:0 auto;}
 .amis-img figcaption{font-size:8pt;color:#6b7280;margin-top:4px;}
 .header{border-bottom:3px solid #e11d48;padding-bottom:8px;margin-bottom:16px;}
 .header h1{margin:0;color:#e11d48;font-size:18pt;}
 .meta{color:#6b7280;font-size:9pt;margin-bottom:18px;}
 .footer{margin-top:28px;border-top:1px solid #e5e7eb;padding-top:8px;font-size:8pt;color:#9ca3af;}
</style></head><body>
<div class="header"><h1>AMISEARCH</h1><div style="font-size:9pt;color:#6b7280;">AMISEARCH tanulási segédlet</div></div>
<h2 style="color:#be123c;">${title}</h2>
<div class="meta">${new Date().toLocaleString("hu-HU")}</div>
${bodyHtml}
<div class="footer">amisearch.org – AI Tutor válasz</div>
</body></html>`;

  // HTML blobot adunk vissza, a böngésző Print → Save as PDF-ként tökéletesen megtartja a struktúrát
  // A régi jsPDF-es megoldásod tömörítette össze, ezért cseréljük erre
  return new Blob([fullHtml], { type: "text/html;charset=utf-8" });
}

// Ez a függvény hívódik a te "Letöltés PDF" gombodból – most már struktúrát tart
export async function downloadAsPdfFile(content, filename = "amisearch-valasz") {
  const blob = await generatePDF(content, filename);
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (w) {
    // Kis késleltetés, hogy a képek betöltsenek, utána a felhasználó nyomja a Mentés PDF-ként-et
    w.onload = () => {
      setTimeout(() => w.print(), 800);
    };
  } else {
    // Ha pop-up blokkolva, letöltjük HTML-ként ami PDF-ként nyitható
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.html`;
    a.click();
  }
}
