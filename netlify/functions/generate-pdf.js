  export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  const { title, content, lang = "hu" } = body;
  
  // 1. Tisztítás: Töröljük a bevezető szövegeket és a LaTeX maradványokat
  let cleanContent = content
    .replace(/^(Rendben|Íme|Tessék|Oké|Szia).+?\n/i, "") // Bevezető törlése
    .replace(/\\frac\{(.+?)\}\{(.+?)\}/g, "$1/$2")      // Törtvonal javítása (a/b formátumra)
    .replace(/\\text\{(.+?)\}/g, "$1")                  // LaTeX szöveg tisztítása
    .replace(/[\{\}\$]/g, "")                           // Maradék kapcsos zárójelek törlése
    .trim();

  // 2. HTML sablon készítése (a böngésző ebből csinál PDF-et)
  const html = `
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
        .header { background: #6C5CE7; color: white; padding: 20px; margin: -40px -40px 40px -40px; text-align: center; }
        h1 { color: #6C5CE7; border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; }
        .content { white-space: pre-wrap; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin:0">Amisearch</h2>
        <p style="margin:0">${lang === 'hu' ? 'Tanulási Segédlet' : 'Study Guide'}</p>
      </div>
      <h1>${title || 'Feladatsor'}</h1>
      <div class="content">${cleanContent}</div>
    </body>
    </html>
  `;

  // Mivel a Netlify-ban nehéz ékezetes PDF-et gyártani, 
  // egy speciális HTML válaszban küldjük vissza, amit a böngésző PDF-ként tud menteni
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=UTF-8" }
  });
  }
