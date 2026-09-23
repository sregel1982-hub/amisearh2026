// pdf-export-fixed.js — AMISEARCH szép PDF export, index.html ÉRINTÉSE NÉLKÜL
// Betöltés: <script src="/pdf-export-fixed.js" defer></script>
// Ez a script FELÜLÍRJA a window.downloadAiAnswerPdf és window.downloadPracticePdf
// függvényeket, miután az index.html már betöltötte és beállította azokat.
// Ezért ennek a <script> tagnek az index.html script-jei UTÁN kell betöltődnie
// (defer attribútummal ez sorrendhelyesen működik).

(function () {
  "use strict";

  // ===== Szöveg -> szépen tördelt, szakaszos szöveg =====
  function formatForExport(text) {
    let t = String(text || "").normalize("NFC").replace(/\r/g, "\n");
    t = t.replace(/[ \t]*[-•][ \t]*/g, "\n• ");
    t = t.replace(
      /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+\$|\\frac\{[^}]+\}\{[^}]+\}|\d+\s+\d+\s*\/\s*\d+|[+\-]?\s*\d+\s*\/\s*\d+)/g,
      "\n$1\n"
    );
    t = t.replace(
      /(^|\n)(\d+\.\s+Lépés|Megoldás|Ellenőrzés|Összefoglalás|Feladat|Adatok|Eredmény|Bizonyítás|Definíció|Tétel|Tulajdonságok)\b/g,
      "$1\n### $2"
    );
    t = t.replace(/([.!?])\s+([A-ZÁÉÍÓÖŐÚŰ])/g, "$1\n\n$2");
    t = t.replace(/\n{3,}/g, "\n\n");
    return t.trim();
  }

  function processLatexSymbols(str) {
    return str
      .replace(/_([a-zA-Z0-9])/g, "<sub>$1</sub>")
      .replace(/_\{([^}]+)\}/g, "<sub>$1</sub>")
      .replace(/\^([a-zA-Z0-9])/g, "<sup>$1</sup>")
      .replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>")
      .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
      .replace(/\\sqrt/g, "√")
      .replace(/\\cdot/g, "·")
      .replace(/\\times/g, "×")
      .replace(/\\div/g, "÷")
      .replace(/\\pm/g, "±")
      .replace(/\\ge/g, "≥")
      .replace(/\\le/g, "≤")
      .replace(/\\neq/g, "≠")
      .replace(/\\approx/g, "≈")
      .replace(/\\infty/g, "∞")
      .replace(/\\pi/g, "π")
      .replace(/\\to/g, "→")
      .replace(/\\Rightarrow/g, "⇒");
  }

  function processLatexInText(text) {
    if (!text) return "";
    let res = text;
    res = res.replace(
      /(\d+)\s+(\d+)\s*\/\s*(\d+)/g,
      function (_, egesz, szam, nev) {
        return egesz + ' <span class="frac"><span class="num">' + szam + '</span><span class="bar">─</span><span class="den">' + nev + "</span></span>";
      }
    );
    res = res.replace(
      /([+\-]?\s*)(\d+)\s*\/\s*(\d+)/g,
      function (_, jel, szam, nev) {
        return (jel || "") + '<span class="frac"><span class="num">' + szam + '</span><span class="bar">─</span><span class="den">' + nev + "</span></span>";
      }
    );
    res = res.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, function (_, szam, nev) {
      return '<span class="frac"><span class="num">' + szam + '</span><span class="bar">─</span><span class="den">' + nev + "</span></span>";
    });
    res = processLatexSymbols(res);
    res = res.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    return res;
  }

  function escapeHtmlLocal(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function toBeautifulHtml(raw) {
    const txt = formatForExport(raw);
    const parts = txt.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
    let html = "";
    let buffer = "";

    function flushPara() {
      if (buffer) {
        html += "<p>" + processLatexInText(escapeHtmlLocal(buffer)) + "</p>";
        buffer = "";
      }
    }

    for (let i = 0; i < parts.length; i++) {
      let line = parts[i];

      if (line.startsWith("### ")) {
        flushPara();
        html += '<h2 class="section-heading">' + escapeHtmlLocal(line.replace(/^###\s+/, "")) + "</h2>";
        continue;
      }
      if (/^(Feladat|Megoldás|Ellenőrzés|Összefoglalás|Adatok|Eredmény|Bizonyítás|Definíció|Tétel)\s*:?$/.test(line)) {
        flushPara();
        html += '<h2 class="section-heading">' + escapeHtmlLocal(line.replace(/:$/, "")) + "</h2>";
        continue;
      }
      if (/^\d+\.\s+[A-ZÁÉÍÓÖŐÚŰ]/.test(line) && line.length < 50) {
        flushPara();
        html += '<h3 class="step-heading">' + escapeHtmlLocal(line) + "</h3>";
        continue;
      }
      if (line.startsWith("•")) {
        flushPara();
        const content = line.slice(1).trim();
        const idx = content.indexOf(":");
        if (idx > 2 && idx < 80) {
          html += '<div class="card"><strong>' + processLatexInText(escapeHtmlLocal(content.slice(0, idx))) + ":</strong> " + processLatexInText(escapeHtmlLocal(content.slice(idx + 1).trim())) + "</div>";
        } else {
          html += '<div class="card">' + processLatexInText(escapeHtmlLocal(content)) + "</div>";
        }
        continue;
      }
      if (line.length > 0) {
        if (buffer.length === 0) {
          buffer = line;
        } else if (buffer.length > 250) {
          flushPara();
          buffer = line;
        } else {
          buffer += " " + line;
        }
      }
    }
    flushPara();
    return html;
  }

  const STYLE = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
    @page{margin:1.8cm 2cm;}
    body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#1e293b;line-height:1.8;font-size:11pt;max-width:750px;margin:0 auto;background:#fff;}
    .section-heading{color:#1e40af;font-size:14pt;font-weight:700;margin:28px 0 12px 0;padding:10px 16px;background:linear-gradient(90deg,#dbeafe,transparent);border-left:5px solid #3b82f6;border-radius:0 8px 8px 0;border-bottom:2px solid #bfdbfe;}
    .step-heading{color:#4f46e5;font-size:12pt;font-weight:600;margin:20px 0 8px 0;padding-bottom:4px;border-bottom:2px solid #c7d2fe;display:inline-block;}
    .frac{display:inline-flex;flex-direction:column;align-items:center;vertical-align:middle;margin:0 0.2em;font-size:0.9em;}
    .frac .num,.frac .den{padding:0 0.25em;text-align:center;}
    .frac .bar{border-bottom:1px solid #1e293b;width:100%;}
    .top{background:linear-gradient(135deg,#6C5CE7,#A29BFE);color:white;padding:20px 24px;border-radius:14px;margin-bottom:20px;}
    .top h1{margin:0;font-size:18px;letter-spacing:0.5px;}
    .top small{opacity:0.9;}
    p{margin:0 0 0.9em 0;text-align:justify;line-height:1.8;}
    .card{background:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #6C5CE7;border-radius:10px;padding:12px 14px;margin:0.8em 0;}
    .card strong{color:#4338CA;}
    .meta{color:#94a3b8;font-size:8.5pt;margin-bottom:16px;}
    .footer{margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:8pt;color:#94a3b8;text-align:center;}
    sub,sup{font-size:0.75em;}
  `;

  function openStyledPrintWindow(title, contentHtml) {
    const win = window.open("", "_blank");
    if (!win) {
      alert("A böngésző letiltotta a felugró ablakot. Engedélyezd a felugró ablakokat ehhez az oldalhoz a PDF exporthoz.");
      return;
    }
    win.document.write(
      "<html><head><meta charset='utf-8'><title>" + escapeHtmlLocal(title) + "</title><style>" + STYLE + "</style></head><body>" +
      '<div class="top"><h1>AMISEARCH</h1><small>' + escapeHtmlLocal(title) + "</small></div>" +
      '<div class="meta">' + new Date().toLocaleString("hu-HU") + "</div>" +
      contentHtml +
      '<div class="footer">amisearch.org</div>' +
      "<script>window.onload=function(){setTimeout(function(){window.print();},350)}<\/script>" +
      "</body></html>"
    );
    win.document.close();
  }

  // ===== AI Tutor chatbuborék PDF-je =====
  window.downloadAiAnswerPdf = function (btn) {
    try {
      const bubble = btn.closest(".bg-white") || (btn.closest ? btn.closest(".ai-message,.chat-message,.message,[data-ai-bubble]") : null);
      if (!bubble) return;
      const clone = bubble.cloneNode(true);
      const tb = clone.querySelector("[data-ai-dl-toolbar]");
      if (tb) tb.remove();
      const raw = (clone.innerText || clone.textContent || "").trim();
      if (!raw) return;
      openStyledPrintWindow("AI válasz", toBeautifulHtml(raw));
    } catch (e) {
      console.error(e);
      alert("PDF generálási hiba: " + (e && e.message ? e.message : e));
    }
  };

  // ===== Feladatgenerátor PDF-je =====
  window.downloadPracticePdf = function (topicName) {
    try {
      const target = document.getElementById("practiceContent");
      if (!target) return;
      const raw = (target.innerText || target.textContent || "").trim();
      if (!raw) return;
      openStyledPrintWindow((topicName || "Feladatok") + " — Feladatok", toBeautifulHtml(raw));
    } catch (e) {
      console.error(e);
      alert("PDF generálási hiba: " + (e && e.message ? e.message : e));
    }
  };

  console.log("✅ AMISEARCH pdf-export-fixed.js aktív — szép PDF export felülírva.");
})();
