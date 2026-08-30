// netlify/functions/export.js - V4 FINAL - lista + KaTeX + tördelés
export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  
  let body;
  try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
  
  const { title, content, lang = "hu" } = body;
  if (!content) return new Response("Missing content", { status: 400 });

  // 1. Magyar ékezet fix + takarítás
  let text = String(content).normalize('NFC').trim();

  // 2. Markdown-szerű formázás: • jelek -> lista
  // A te AI-d • karakterrel ad listát, azt alakítjuk <ul>-lé
  let htmlContent = text
    // Dupla sortörés = új bekezdés
    .split(/\n\s*\n/)
    .map(block => {
      block = block.trim();
      if (!block) return '';
      
      // Ha • vagy - vagy számozott lista
      if (block.includes('•') || block.match(/^\s*[-•]\s+/m) || block.match(/^\s*\d+\.\s+/m)) {
        let items = block.split(/•/).filter(Boolean);
        if (items.length <= 1) {
          // - vagy 1. lista
          items = block.split(/\n/).filter(l => l.trim().match(/^[-•\d\.]/));
        }
        if (items.length > 1) {
          let lis = items.map(item => {
            let clean = item.trim()
              .replace(/^[-•\s\d\.]+/, '')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              .replace(/\^(\d+)/g, '<sup>$1</sup>') // 2^3 -> 2³
              .replace(/(\d+)\^(\d+)/g, '$1<sup>$2</sup>');
            // Képletek: 2×2×2=8
            clean = clean.replace(/(\d+)\s*×\s*(\d+)/g, '$1 × $2');
            return `<li>${clean}</li>`;
          }).join('');
          return `<ul>${lis}</ul>`;
        }
      }
      
      // Sima bekezdés + félkövér + dőlt
      let p = block
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
      
      return `<p>${p}</p>`;
    })
    .join('');

  // 3. HTML sablon - ezzel már szépen tördelt lesz
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
  body { font-family: 'Poppins', sans-serif; padding: 32px 40px; color: #2D3436; line-height: 1.8; font-size: 13.5px; }
  .header { background: linear-gradient(135deg, #0D7C66 0%, #10B981 100%); color: white; padding: 20px 24px; margin: -32px -40px 24px -40px; border-radius: 0 0 12px 12px; }
  .header h2 { margin: 0; font-size: 20px; letter-spacing: 0.5px; }
  .header p { margin: 4px 0 0 0; opacity: 0.9; font-size: 13px; }
  h1 { color: #0D7C66; font-size: 20px; border-bottom: 2px solid #0D7C66; padding-bottom: 8px; margin: 0 0 20px 0; }
  p { margin: 10px 0; text-align: justify; }
  ul { margin: 12px 0 12px 20px; padding: 0; }
  li { margin: 8px 0; line-height: 1.7; padding-left: 4px; }
  li::marker { color: #0D7C66; }
  strong { font-weight: 700; color: #1a202c; }
  em { font-style: italic; color: #4a5568; }
  sup { font-size: 0.8em; vertical-align: super; color: #6C5CE7; font-weight: 600; }
  code { background: #f0fdf4; color: #0D7C66; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
  .example { background: #f8fafc; border-left: 3px solid #0D7C66; padding: 8px 12px; margin: 8px 0; border-radius: 0 6px 6px 0; }
</style>
</head>
<body>
  <div class="header">
    <h2>AMISEARCH</h2>
    <p>AMISEARCH tanulási segédlet</p>
  </div>
  <h1>${(title||'AI válasz').replace(/</g,'&lt;')}</h1>
  <div class="content">${htmlContent}</div>
  <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10px; color: #94a3b8; text-align: center;">
    ${new Date().toLocaleString('hu-HU')} • amisearch.org
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=UTF-8", "Access-Control-Allow-Origin": "*" }
  });
}
