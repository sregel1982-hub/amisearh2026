// netlify/functions/export.js - FIXED V3 - KaTeX + tördelés megőrizve
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

marked.setOptions({
  breaks: true,
  gfm: true,
  mangle: false,
  headerIds: false
});

export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch (e) { return new Response("Invalid JSON", { status: 400 }); }

  const { title, content, lang = "hu" } = body;
  if (!content) return new Response("Missing content", { status: 400 });
  
  // FIX: NE töröljük a LaTeX-et! Csak a felesleges bevezetőt
  let cleanContent = String(content)
    .normalize('NFC') // magyar őű fix
    .replace(/^(Rendben|Íme|Tessék|Oké|Szia|Itt van).+?:?\n*/i, "")
    .trim();

  // Markdown -> HTML (megőrzi a **bold**, listák, képletek)
  let htmlContent = marked.parse(cleanContent);
  htmlContent = purify.sanitize(htmlContent, {
    USE_PROFILES: { html: true },
    ALLOWED_TAGS: ['p','br','strong','em','ul','ol','li','h1','h2','h3','h4','blockquote','code','pre','a','span','div','table','thead','tbody','tr','th','td','hr'],
    ALLOWED_ATTR: ['href','class','style']
  });

  // HTML sablon KaTeX CSS-sel
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap');
        body { 
          font-family: 'Poppins', 'Noto Sans', Arial, sans-serif; 
          padding: 40px; 
          color: #2D3436; 
          line-height: 1.7; 
          font-size: 14px;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .header { 
          background: linear-gradient(135deg, #6C5CE7 0%, #A29BFE 100%); 
          color: white; 
          padding: 24px; 
          margin: -40px -40px 32px -40px; 
          text-align: center; 
          border-radius: 0 0 16px 16px;
        }
        h1 { color: #6C5CE7; border-bottom: 2px solid #6C5CE7; padding-bottom: 8px; margin: 24px 0 16px 0; font-size: 22px; }
        h2 { color: #6C5CE7; margin: 20px 0 12px 0; font-size: 18px; }
        h3 { color: #2D3436; margin: 16px 0 8px 0; font-size: 16px; }
        .content { 
          font-size: 14px; 
          line-height: 1.7;
        }
        .content p { margin: 8px 0; }
        .content ul, .content ol { margin: 8px 0 8px 24px; }
        .content li { margin: 4px 0; }
        .content strong { font-weight: 700; color: #2D3436; }
        .content code { 
          background: #f3f0ff; 
          color: #5A4BD1; 
          padding: 2px 6px; 
          border-radius: 4px; 
          font-family: 'Consolas', monospace;
          font-size: 13px;
        }
        .content pre { 
          background: #1e1e2e; 
          color: #f8f8f2; 
          padding: 16px; 
          border-radius: 8px; 
          overflow-x: auto;
          margin: 12px 0;
          white-space: pre-wrap;
        }
        .content blockquote {
          border-left: 4px solid #6C5CE7;
          padding-left: 16px;
          margin: 12px 0;
          color: #636e72;
          font-style: italic;
        }
        .content table { border-collapse: collapse; width: 100%; margin: 12px 0; }
        .content th, .content td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        .content th { background: #f3f0ff; font-weight: 600; }
        .katex { font-size: 1.1em; }
        .katex-display { margin: 12px 0; }
        @media print {
          body { padding: 20px; }
          .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h2 style="margin:0; font-size: 20px;">AMISEARCH</h2>
        <p style="margin:4px 0 0 0; opacity:0.9">${lang === 'hu' ? 'Tanulási Segédlet' : 'Study Guide'}</p>
      </div>
      <h1>${title ? title.replace(/</g,'&lt;') : 'Feladatsor'}</h1>
      <div class="content">${htmlContent}</div>
      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 11px; color: #888; text-align: center;">
        Generálva: ${new Date().toLocaleString('hu-HU')} • amisearch.org
      </div>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
      <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters: [{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false},{left:'\\\\[',right:'\\\\]',display:true},{left:'\\\\(',right:'\\\\)',display:false}], throwOnError:false});"></script>
    </body>
    </html>
  `;

  return new Response(html, {
    headers: { 
      "Content-Type": "text/html; charset=UTF-8",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
