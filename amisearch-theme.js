(function () {
  'use strict';

  const BRAND = 'AMISEARCH';
  const themes = {
    purple: { label: 'Lila', en: 'Purple', primary: '#6C5CE7', dark: '#5A4BD1', accent: '#A29BFE', soft: '#F3F0FF', ring: '#A29BFE' },
    blue:   { label: 'Kék', en: 'Blue', primary: '#2563EB', dark: '#1D4ED8', accent: '#93C5FD', soft: '#EFF6FF', ring: '#93C5FD' },
    green:  { label: 'Zöld', en: 'Green', primary: '#059669', dark: '#047857', accent: '#6EE7B7', soft: '#ECFDF5', ring: '#6EE7B7' },
    orange: { label: 'Narancs', en: 'Orange', primary: '#EA580C', dark: '#C2410C', accent: '#FDBA74', soft: '#FFF7ED', ring: '#FDBA74' },
    rose:   { label: 'Rózsa', en: 'Rose', primary: '#E11D48', dark: '#BE123C', accent: '#FDA4AF', soft: '#FFF1F2', ring: '#FDA4AF' }
  };

  function currentLang() {
    return window.currentLang === 'en' ? 'en' : 'hu';
  }

  /* --- TTS / FELOLVASÓ FUNKCIÓK --- */
  window.speakText = function (text) {
    if (!('speechSynthesis' in window)) {
      alert('A böngésződ nem támogatja a szövegfelolvasást.');
      return;
    }
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      return;
    }
    const clean = cleanText(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = currentLang() === 'hu' ? 'hu-HU' : 'en-US';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  function latexToPlain(value) {
    let text = String(value || '');

    for (let i = 0; i < 8; i += 1) {
      text = text.replace(/\\dfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
      text = text.replace(/\\tfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
      text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    }

    text = text
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '($2)^(1/$1)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(/\\left|\\right/g, '')
      .replace(/\\times|\\cdot|\\ast/g, '·')
      .replace(/\\div/g, '÷')
      .replace(/\\pm/g, '±')
      .replace(/\\mp/g, '∓')
      .replace(/\\leq|\\le/g, '≤')
      .replace(/\\geq|\\ge/g, '≥')
      .replace(/\\neq|\\ne/g, '≠')
      .replace(/\\approx/g, '≈')
      .replace(/\\infty/g, '∞')
      .replace(/\\pi/g, 'π')
      .replace(/\\alpha/g, 'α')
      .replace(/\\beta/g, 'β')
      .replace(/\\gamma/g, 'γ')
      .replace(/\\delta/g, 'δ')
      .replace(/\\theta/g, 'θ')
      .replace(/\\lambda/g, 'λ')
      .replace(/\\mu/g, 'μ')
      .replace(/\\sigma/g, 'σ')
      .replace(/\\phi/g, 'φ')
      .replace(/\\omega/g, 'ω')
      .replace(/\\sum/g, 'Σ')
      .replace(/\\prod/g, 'Π')
      .replace(/\\int/g, '∫')
      .replace(/\\rightarrow|\\to/g, '→')
      .replace(/\\leftarrow/g, '←')
      .replace(/\\Rightarrow/g, '⇒')
      .replace(/\\Leftrightarrow|\\iff/g, '⇔')
      .replace(/\\ldots|\\dots/g, '…')
      .replace(/\\,/g, ' ')
      .replace(/\\;/g, ' ')
      .replace(/\\!/g, '')
      .replace(/\\quad|\\qquad/g, '  ')
      .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbf\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\overline\s*\{([^{}]*)\}/g, '$1̄')
      .replace(/\\underline\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\hat\s*\{([^{}]*)\}/g, '$1̂')
      .replace(/\\bar\s*\{([^{}]*)\}/g, '$1̄');

    const SUPER = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ' };
    const SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ', 'x': 'ₓ', 'i': 'ᵢ', 'n': 'ₙ', 'm': 'ₘ', 't': 'ₜ' };

    function toSuper(s) { return String(s).split('').map((c) => SUPER[c] || c).join(''); }
    function toSub(s) { return String(s).split('').map((c) => SUB[c] || c).join(''); }

    text = text.replace(/\^\{([^{}]+)\}/g, (_, exp) => {
      const clean = exp.replace(/\s+/g, '');
      return /^[0-9+\-()n]+$/.test(clean) ? toSuper(clean) : '^(' + exp + ')';
    });
    text = text.replace(/_\{([^{}]+)\}/g, (_, sub) => {
      const clean = sub.replace(/\s+/g, '');
      return /^[0-9+\-()a-z]+$/i.test(clean) ? toSub(clean) : '_(' + sub + ')';
    });

    text = text.replace(/\^([0-9n+\-])/g, (_, c) => SUPER[c] || ('^' + c));
    text = text.replace(/_([0-9a-z])/gi, (_, c) => SUB[c.toLowerCase()] || ('_' + c));

    return text
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s*([·÷±≤≥≠≈→←⇒⇔])\s*/g, ' $1 ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function cleanText(value) {
    return latexToPlain(String(value || ''))
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2018\u2019]/g, '’')
      .replace(/[\u201C\u201D]/g, '”')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\s+([.,;:!?])/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sanitizeFilename(name) {
    const fallback = 'amisearch-letoltes';
    const raw = cleanText(name || fallback) || fallback;
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || fallback;
  }

  function loadScriptOnce(src, testFn) {
    return new Promise((resolve, reject) => {
      try {
        if (testFn && testFn()) return resolve();
        const existing = document.querySelector('script[src^="' + src.split('?')[0] + '"]');
        if (existing) {
          const done = () => (!testFn || testFn()) ? resolve() : reject(new Error('Nem érhető el: ' + src));
          existing.addEventListener('load', done, { once: true });
          existing.addEventListener('error', () => reject(new Error('Nem tölthető be: ' + src)), { once: true });
          setTimeout(done, 350);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => (!testFn || testFn()) ? resolve() : reject(new Error('Nem érhető el: ' + src));
        script.onerror = () => reject(new Error('Nem tölthető be: ' + src));
        document.head.appendChild(script);
      } catch (e) {
        reject(e);
      }
    });
  }

  async function ensurePdfMake() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js', () => !!window.pdfMake);
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js', () => !!(window.pdfMake && window.pdfMake.vfs));
    if (window.pdfMake && window.pdfMake.vfs) {
      window.pdfMake.fonts = {
        Roboto: {
          normal: 'Roboto-Regular.ttf',
          bold: 'Roboto-Medium.ttf',
          italics: 'Roboto-Italic.ttf',
          bolditalics: 'Roboto-MediumItalic.ttf'
        }
      };
    }
  }

  function removeExportControls(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-ai-dl-toolbar], #practiceToolbar, #examToolbar, .no-print, .pdf-hide').forEach((el) => el.remove());
    root.querySelectorAll('button').forEach((el) => {
      const txt = (el.innerText || el.textContent || '').toLowerCase();
      if (/pdf|word|letölt|download|másol|copy|idő indítása|start timer/.test(txt)) el.remove();
    });
  }

  function normalizeMathForExport(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.katex').forEach((el) => {
      const annotation = el.querySelector('annotation[encoding="application/x-tex"], annotation');
      let latex = annotation ? annotation.textContent || '' : el.getAttribute('data-latex') || '';
      let plain = latex ? latexToPlain(latex) : (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      el.replaceWith(document.createTextNode(plain ? ' ' + plain + ' ' : ' '));
    });
    root.querySelectorAll('.katex-html, .katex-mathml, math, annotation, [aria-hidden="true"]').forEach((el) => el.remove());
  }

  function elementToText(sourceEl) {
    if (!sourceEl) return '';
    const clone = sourceEl.cloneNode(true);
    removeExportControls(clone);
    normalizeMathForExport(clone);
    clone.querySelectorAll('script, style, noscript, svg, canvas').forEach((el) => el.remove());
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,table,section,article,div,tr').forEach((el) => {
      if (el.tagName === 'LI') el.prepend('• ');
      el.appendChild(document.createTextNode('\n'));
    });
    return cleanText(clone.innerText || clone.textContent || '');
  }

  function extractTitleLine(text, fallback) {
    const first = cleanText(text).split('\n').map((s) => s.trim()).find(Boolean);
    return (first || fallback || BRAND + ' dokumentum').slice(0, 120);
  }

  /* --- STÍLUSOS PDF BLOKK FORMÁZÓ (GROK 3. KÉP ALAPJÁN) --- */
  function textToStructuredPdfContent(text) {
    const content = [];
    const lines = cleanText(text).split('\n');

    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) return;

      // Feladat fejléc / Blokk (Kék kiemelősáv)
      if (/^(\d+\.\s*Feladat|Feladat|Task)/i.test(line) || /^#{1,3}\s+/.test(line)) {
        const titleText = line.replace(/^#{1,6}\s+/, '');
        content.push({
          table: {
            widths: ['*'],
            body: [[
              { text: titleText, fillColor: '#2563EB', color: '#FFFFFF', bold: true, fontSize: 12, margin: [8, 6, 8, 6] }
            ]]
          },
          layout: 'noBorders',
          margin: [0, 10, 0, 6]
        });
      }
      // Megoldás fejléc (Zöld kiemelősáv)
      else if (/^Megoldás|Solution/i.test(line)) {
        content.push({
          table: {
            widths: ['*'],
            body: [[
              { text: line, fillColor: '#059669', color: '#FFFFFF', bold: true, fontSize: 12, margin: [8, 6, 8, 6] }
            ]]
          },
          layout: 'noBorders',
          margin: [0, 10, 0, 6]
        });
      }
      // Lista elemek
      else if (/^([a-z]\)|•|\d+\.)\s+/i.test(line)) {
        content.push({ text: line, style: 'body', bold: /^[a-z]\)/i.test(line), margin: [10, 2, 0, 3] });
      }
      // Normál szöveg / lépések
      else {
        content.push({ text: line, style: 'body', margin: [0, 3, 0, 3] });
      }
    });

    return content;
  }

  async function exportTextToPdf(text, opts) {
    await ensurePdfMake();
    const lang = currentLang();
    const clean = cleanText(text);
    const title = cleanText(opts?.title || extractTitleLine(clean, BRAND));
    const subtitle = cleanText(opts?.subtitle || (lang === 'hu' ? 'Feladatok, megoldások és magyarázatok' : 'Tasks, solutions and explanations'));
    const filename = sanitizeFilename(opts?.filename || title) + '.pdf';

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 80, 40, 40],
      info: { title: title, author: BRAND, subject: subtitle },
      defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.35, color: '#1F2937' },
      header: function () {
        return {
          margin: [40, 15, 40, 0],
          stack: [
            {
              table: {
                widths: ['*'],
                body: [[
                  {
                    fillColor: '#2563EB',
                    margin: [12, 10, 12, 10],
                    stack: [
                      { text: BRAND, color: '#FFFFFF', bold: true, fontSize: 16 },
                      { text: subtitle, color: '#DBEAFE', fontSize: 9, margin: [0, 2, 0, 0] }
                    ]
                  }
                ]]
              },
              layout: 'noBorders'
            }
          ]
        };
      },
      footer: function (currentPage, pageCount) {
        return {
          columns: [
            { text: 'amisearch.org', color: '#9CA3AF', fontSize: 8, margin: [40, 10, 0, 0] },
            { text: currentPage + ' / ' + pageCount, alignment: 'right', color: '#9CA3AF', fontSize: 8, margin: [0, 10, 40, 0] }
          ]
        };
      },
      content: [
        { text: title, style: 'mainTitle', margin: [0, 0, 0, 4] },
        { text: new Date().toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US'), style: 'meta', margin: [0, 0, 0, 12] },
        ...textToStructuredPdfContent(clean)
      ],
      styles: {
        mainTitle: { fontSize: 18, bold: true, color: '#111827' },
        body: { fontSize: 10, lineHeight: 1.35, color: '#1F2937' },
        meta: { fontSize: 8.5, color: '#6B7280' }
      }
    };

    window.pdfMake.createPdf(docDefinition).download(filename);
  }

  function findAiBubbleFrom(btn) {
    return btn?.closest?.('.ai-message, .chat-message, .message, .prose, [data-ai-bubble], .bg-white') || btn?.parentElement || null;
  }

  function installStructuredExports() {
    window.downloadAiAnswerPdf = async function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try {
        await exportTextToPdf(elementToText(bubble), {
          title: currentLang() === 'hu' ? 'AI válasz' : 'AI answer',
          subtitle: BRAND + ' tanulási segédlet',
          filename: q
        });
      } catch (e) {
        console.error('[amisearch] AI PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadPracticePdf = async function (topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Feladatsor' : 'Practice sheet')).replace(/_/g, ' '));
      try {
        await exportTextToPdf(elementToText(target), {
          title: topic + (currentLang() === 'hu' ? ' — Feladatok' : ' — Tasks'),
          subtitle: 'Feladatok, megoldások és magyarázatok',
          filename: topic + '-feladatok'
        });
      } catch (e) {
        console.error('[amisearch] Practice PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadExamPdf = async function (topicName) {
      const target = document.getElementById('examContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Vizsgaszimulátor' : 'Exam simulator')).replace(/_/g, ' '));
      try {
        await exportTextToPdf(elementToText(target), {
          title: topic,
          subtitle: 'Vizsgaszimulátor feladatsor',
          filename: topic + '-vizsga'
        });
      } catch (e) {
        console.error('[amisearch] Exam PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    // Felolvasó indítása a válasznál
    window.readAiAnswer = function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (bubble) window.speakText(elementToText(bubble));
    };
  }

  function init() {
    window.amisearchExportTextToPdf = exportTextToPdf;
    installStructuredExports();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
      
