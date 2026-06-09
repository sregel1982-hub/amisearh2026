import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get(key));
const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  try {
    // --- 1. HA GET KÉRÉS ÉRKEZIK: Visszaadjuk a színválasztó scriptet a böngészőnek ---
    if (req.method === "GET") {
      const clientScript = `
        (function() {
          const themes = {
            blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE' },
            purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF' },
            emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5' },
            orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7' }
          };

          window.changeSiteTheme = function(themeName) {
            const theme = themes[themeName];
            if (!theme) return;

            let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
            styleTag.id = 'dynamic-theme-style';
            styleTag.innerHTML = \`
              :root { --primary-color: \${theme.primary} !important; }
              header, .bg-indigo-600, .bg-\\\\[\\\\#6C5CE7\\\\], .btn-primary, button[type="submit"],
              .bg-purple-600, [class*="bg-purple-"], [class*="bg-indigo-"] {
                background-color: \${theme.primary} !important;
              }
              .text-indigo-600, .text-\\\\[\\\\#6C5CE7\\\\], .text-purple-600,
              [class*="text-purple-"], [class*="text-indigo-"] {
                color: \${theme.primary} !important;
              }
              .border-indigo-600, .border-\\\\[\\\\#6C5CE7\\\\], .border-purple-600,
              [class*="border-purple-"], [class*="border-indigo-"] {
                border-color: \${theme.primary} !important;
              }
              .bg-indigo-50, .bg-purple-50 { background-color: \${theme.light} !important; }
              svg, svg path, svg circle, .lucide {
                stroke: \${theme.primary} !important;
                fill: transparent;
              }
              svg[fill*="#"], svg path[fill*="#"] { fill: \${theme.primary} !important; stroke: none !important; }
            \`;
            if (!styleTag.parentElement) document.head.appendChild(styleTag);
            localStorage.setItem('amisearch-theme', themeName);
          };

          function init() {
            if (document.getElementById('amisearch-picker')) return;
            const picker = document.createElement('div');
            picker.id = 'amisearch-picker';
            picker.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:10px; border-radius:30px; display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:2px solid #6C5CE7;';
            
            Object.keys(themes).forEach(name => {
              const circle = document.createElement('div');
              circle.style.cssText = 'width:25px; height:25px; border-radius:50%; background:' + themes[name].primary + '; cursor:pointer; border:2px solid white;';
              circle.onclick = () => window.changeSiteTheme(name);
              picker.appendChild(circle);
            });

            document.body.appendChild(picker);

            try {
              const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
              let node;
              while ((node = walker.nextNode())) {
                if (node.nodeValue && (node.nodeValue.includes('Amisearh') || node.nodeValue.includes('Amisrarh'))) {
                  node.nodeValue = node.nodeValue.replace(/Amisearh|Amisrarh/g, 'Amisearch');
                }
              }
            } catch (e) {
              console.warn('Text walker error:', e);
            }

            const saved = localStorage.getItem('amisearch-theme');
            if (saved) window.changeSiteTheme(saved);
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
          } else {
            init();
          }

          window.downloadNote = async function(id) {
            try {
              const headers = typeof window.getAuthHeaders === 'function' ? await window.getAuthHeaders({}) : {};
              const resp = await fetch(\`/.netlify/functions/download-note?id=\${id}\`, { headers });
              const d = await resp.json();
              if (d.url) window.open(d.url, '_blank');
            } catch (err) {
              console.error('Download error:', err);
              alert('Letöltési hiba történt.');
            }
          };
        })();
      `;

      return new Response(clientScript, {
        status: 200,
        headers: { "Content-Type": "application/javascript; charset=utf-8" }
      });
    }

    // --- 2. HA POST KÉRÉS ÉRKEZIK: Itt fut a valódi Gemini 2.5 Feladat generátor ---
    if (req.method === "POST") {
      const user = await getSupabaseUser(req);
      if (!user) return jsonError("Unauthorized", 401);

      if (!isAiConfigured()) return aiUnavailableResponse();

      const body = await req.json().catch(() => ({}));
      const { topic, difficulty, count } = body;

      if (!topic) return jsonError("Topic is required", 400);

      const prompt = `Te egy zseniális magyar tanár vagy. Készíts ${count || 3} darab ${difficulty || 'könnyű'} feladatot a következő témában: "${topic}". 
      Minden feladat után adj részletes, érthető megoldást és magyarázatot is lépésről lépésre magyarul. Formázd áttekinthetően Markdown-nal.`;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });

      const text = result.text ? result.text() : "Nem sikerült feladatokat generálni.";

      return new Response(JSON.stringify({ success: true, tasks: text }), {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    return jsonError("Method not allowed", 405);

  } catch (error) {
    console.error("Critical error in notes-extra:", error);
    return aiUnavailableResponse();
  }
}
