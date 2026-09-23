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

  function latexToPlain(value) {
    let text = String(value || '');

    // Többszörös \frac kezelés (belső → külső)
    for (let i = 0; i < 8; i += 1) {
      text = text.replace(/\\dfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
      text = text.replace(/\\tfrac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
      text = text.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)');
    }

    // Gyök, hatvány, index, operátorok, görög betűk
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

    // Unicode szuper- és alsó indexek
    const SUPER = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
      '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻',
      '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ'
    };
    const SUB = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅',
      '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋',
      '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'o': 'ₒ',
      'x': 'ₓ', 'i': 'ᵢ', 'n': 'ₙ', 'm': 'ₘ', 't': 'ₜ'
    };

    function toSuper(s) {
      return String(s).split('').map((c) => SUPER[c] || c).join('');
    }
    function toSub(s) {
      return String(s).split('').map((c) => SUB[c] || c).join('');
    }

    // ^{...} és _{...}
    text = text.replace(/\^\{([^{}]+)\}/g, (_, exp) => {
      const clean = exp.replace(/\s+/g, '');
      if (/^[0-9+\-()n]+$/.test(clean)) return toSuper(clean);
      return '^(' + exp + ')';
    });
    text = text.replace(/_\{([^{}]+)\}/g, (_, sub) => {
      const clean = sub.replace(/\s+/g, '');
      if (/^[0-9+\-()a-z]+$/i.test(clean)) return toSub(clean);
      return '_(' + sub + ')';
    });

    // Egy karakteres ^2, _n
    text = text.replace(/\^([0-9n+\-])/g, (_, c) => SUPER[c] || ('^' + c));
    text = text.replace(/_([0-9a-z])/gi, (_, c) => SUB[c.toLowerCase()] || ('_' + c));

    // Maradék LaTeX parancsok és zárójelek tisztítása
    // FONTOS: a sortöréseket (\n) megtartjuk
    text = text
      .replace(/\\[a-zA-Z]+/g, '')
      .replace(/[{}]/g, '')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s*([·÷±≤≥≠≈→←⇒⇔])\s*/g, ' $1 ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return text;
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

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
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
          const done = () => (!testFn || testFn()) ? resolve() : reject(new Error('A könyvtár betöltődött, de nem érhető el: ' + src));
          existing.addEventListener('load', done, { once: true });
          existing.addEventListener('error', () => reject(new Error('Nem tölthető be: ' + src)), { once: true });
          setTimeout(done, 350);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => (!testFn || testFn()) ? resolve() : reject(new Error('A könyvtár betöltődött, de nem érhető el: ' + src));
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

  async function ensureDocx() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js', () => !!window.docx);
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
      let latex = '';
      if (annotation) latex = annotation.textContent || '';
      if (!latex) latex = el.getAttribute('data-latex') || '';

      let plain = '';
      if (latex) {
        plain = latexToPlain(latex);
      } else {
        plain = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
      }

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
    // Bővített blokk-szelektor: div/tr is sortörést kap
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

  function textToPdfContent(text) {
    const content = [];
    for (const raw of cleanText(text).split('\n')) {
      const line = raw.trim();
      if (!line) {
        content.push({ text: ' ', margin: [0, 2, 0, 2] });
      } else if (/^#{1,6}\s+/.test(line)) {
        const level = (line.match(/^#+/) || ['#'])[0].length;
        content.push({ text: line.replace(/^#{1,6}\s+/, ''), style: level <= 2 ? 'sectionHeader' : 'subHeader', margin: [0, 11, 0, 5] });
      } else if (/^(\d+[.)]|[-*•])\s+/.test(line)) {
        content.push({ text: line.replace(/^[-*]\s+/, '• '), style: 'body', margin: [14, 2, 0, 3] });
      } else if (/^[-–—]{3,}$/.test(line)) {
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: 511, y2: 4, lineWidth: 0.5, lineColor: '#E5E7EB' }], margin: [0, 6, 0, 6] });
      } else {
        content.push({ text: line, style: 'body', margin: [0, 2, 0, 4] });
      }
    }
    return content;
  }

  async function exportTextToPdf(text, opts) {
    await ensurePdfMake();
    const lang = currentLang();
    const clean = cleanText(text);
    const title = cleanText(opts?.title || extractTitleLine(clean, BRAND));
    const subtitle = cleanText(opts?.subtitle || (lang === 'hu' ? 'Tanulási segédlet' : 'Study document'));
    const filename = sanitizeFilename(opts?.filename || title) + '.pdf';
    const themeName = localStorage.getItem('amisearch-theme') || 'purple';
    const theme = themes[themeName] || themes.purple;

    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [56, 92, 56, 58],
      info: { title: title, author: BRAND, subject: subtitle, creator: BRAND },
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.35, color: '#111827' },
      header: function () {
        return {
          margin: [56, 22, 56, 0],
          stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 483, h: 52, r: 10, color: theme.dark }] },
            { text: BRAND, color: '#FFFFFF', bold: true, fontSize: 18, absolutePosition: { x: 76, y: 35 } },
            { text: subtitle, color: '#F8FAFC', fontSize: 9, absolutePosition: { x: 76, y: 58 } }
          ]
        };
      },
      footer: function (currentPage, pageCount) {
        return { columns: [
          { text: 'amisearch.org', color: '#6B7280', fontSize: 8, margin: [56, 16, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', color: '#6B7280', fontSize: 8, margin: [0, 16, 56, 0] }
        ] };
      },
      content: [
        { text: title, style: 'title', margin: [0, 0, 0, 8] },
        { text: new Date().toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US'), style: 'meta', margin: [0, 0, 0, 14] },
        ...textToPdfContent(clean)
      ],
      styles: {
        title: { fontSize: 20, bold: true, color: theme.dark },
        sectionHeader: { fontSize: 15, bold: true, color: theme.primary },
        subHeader: { fontSize: 13, bold: true, color: '#111827' },
        body: { fontSize: 10.5, lineHeight: 1.35, color: '#111827' },
        meta: { fontSize: 8.5, color: '#6B7280' }
      }
    };
    window.pdfMake.createPdf(docDefinition).download(filename);
  }

  function docxPara(text, options) {
    const d = window.docx;
    return new d.Paragraph(Object.assign({ children: [new d.TextRun({ text: cleanText(text), size: 22 })], spacing: { after: 90 } }, options || {}));
  }

  function textToDocxParagraphs(text) {
    const d = window.docx;
    const paragraphs = [];
    for (const raw of cleanText(text).split('\n')) {
      const line = raw.trim();
      if (!line) {
        paragraphs.push(new d.Paragraph({ text: '', spacing: { after: 120 } }));
      } else if (/^#{1,6}\s+/.test(line)) {
        paragraphs.push(new d.Paragraph({ children: [new d.TextRun({ text: line.replace(/^#{1,6}\s+/, ''), bold: true, color: '2563EB', size: 28 })], spacing: { before: 220, after: 100 } }));
      } else if (/^(\d+[.)]|[-*•])\s+/.test(line)) {
        paragraphs.push(new d.Paragraph({ children: [new d.TextRun({ text: line.replace(/^[-*]\s+/, '• '), size: 22 })], indent: { left: 360 }, spacing: { after: 80 } }));
      } else {
        paragraphs.push(docxPara(line));
      }
    }
    return paragraphs;
  }

  async function exportTextToDocx(text, opts) {
    await ensureDocx();
    const d = window.docx;
    const clean = cleanText(text);
    const title = cleanText(opts?.title || extractTitleLine(clean, BRAND));
    const filename = sanitizeFilename(opts?.filename || title) + '.docx';
    const themeName = localStorage.getItem('amisearch-theme') || 'purple';
    const theme = themes[themeName] || themes.purple;
    const primary = theme.primary.replace('#', '').toUpperCase();
    const dark = theme.dark.replace('#', '').toUpperCase();

    const doc = new d.Document({
      creator: BRAND,
      title: title,
      description: BRAND + ' export',
      sections: [{
        properties: { page: { margin: { top: 900, right: 950, bottom: 850, left: 950 } } },
        children: [
          new d.Paragraph({ children: [new d.TextRun({ text: BRAND, bold: true, color: primary, size: 36 })], spacing: { after: 100 } }),
          new d.Paragraph({ children: [new d.TextRun({ text: title, bold: true, color: dark, size: 30 })], spacing: { after: 100 } }),
          new d.Paragraph({ children: [new d.TextRun({ text: new Date().toLocaleString(currentLang() === 'hu' ? 'hu-HU' : 'en-US'), color: '6B7280', size: 18 })], spacing: { after: 240 } }),
          ...textToDocxParagraphs(clean)
        ]
      }]
    });
    const blob = await d.Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function findAiBubbleFrom(btn) {
    if (typeof window._findAiBubbleFrom === 'function') {
      try { const found = window._findAiBubbleFrom(btn); if (found) return found; } catch (_) {}
    }
    return btn?.closest?.('.ai-message, .chat-message, .message, .prose, [data-ai-bubble]') || btn?.parentElement?.closest?.('div') || btn?.parentElement || null;
  }

  function installStructuredExports() {
    window.downloadAiAnswerPdf = async function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try { await exportTextToPdf(elementToText(bubble), { title: currentLang() === 'hu' ? 'AI válasz' : 'AI answer', subtitle: currentLang() === 'hu' ? BRAND + ' tanulási segédlet' : BRAND + ' study document', filename: q }); }
      catch (e) { console.error('[amisearch] AI PDF export hiba:', e); alert('PDF generálás hiba: ' + (e?.message || e)); }
    };

    window.downloadAiAnswerWord = async function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try { await exportTextToDocx(elementToText(bubble), { title: currentLang() === 'hu' ? 'AI válasz' : 'AI answer', filename: q }); }
      catch (e) { console.error('[amisearch] AI Word export hiba:', e); alert('Word generálás hiba: ' + (e?.message || e)); }
    };

    window.downloadPracticePdf = async function (topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Feladatsor' : 'Practice sheet')).replace(/_/g, ' '));
      try { await exportTextToPdf(elementToText(target), { title: topic + (currentLang() === 'hu' ? ' — Feladatok' : ' — Tasks'), subtitle: currentLang() === 'hu' ? 'Feladatok, megoldások és magyarázatok' : 'Tasks, solutions and explanations', filename: topic + '-feladatok' }); }
      catch (e) { console.error('[amisearch] Practice PDF export hiba:', e); alert('PDF generálás hiba: ' + (e?.message || e)); }
    };

    window.downloadPracticeWord = async function (topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Feladatsor' : 'Practice sheet')).replace(/_/g, ' '));
      try { await exportTextToDocx(elementToText(target), { title: topic + (currentLang() === 'hu' ? ' — Feladatok' : ' — Tasks'), filename: topic + '-feladatok' }); }
      catch (e) { console.error('[amisearch] Practice Word export hiba:', e); alert('Word generálás hiba: ' + (e?.message || e)); }
    };

    window.downloadExamPdf = async function (topicName) {
      const target = document.getElementById('examContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Vizsgaszimulátor' : 'Exam simulator')).replace(/_/g, ' '));
      try { await exportTextToPdf(elementToText(target), { title: topic, subtitle: currentLang() === 'hu' ? 'Vizsgaszimulátor feladatsor' : 'Exam simulator sheet', filename: topic + '-vizsga' }); }
      catch (e) { console.error('[amisearch] Exam PDF export hiba:', e); alert('PDF generálás hiba: ' + (e?.message || e)); }
    };

    window.downloadExamWord = async function (topicName) {
      const target = document.getElementById('examContent');
      if (!target) return;
      const topic = cleanText(String(topicName || (currentLang() === 'hu' ? 'Vizsgaszimulátor' : 'Exam simulator')).replace(/_/g, ' '));
      try { await exportTextToDocx(elementToText(target), { title: topic, filename: topic + '-vizsga' }); }
      catch (e) { console.error('[amisearch] Exam Word export hiba:', e); alert('Word generálás hiba: ' + (e?.message || e)); }
    };
  }

  function applyTheme(name) {
    const themeName = themes[name] ? name : 'purple';
    const theme = themes[themeName];
    document.documentElement.style.setProperty('--am-primary', theme.primary);
    document.documentElement.style.setProperty('--am-primary-dark', theme.dark);
    document.documentElement.style.setProperty('--am-accent', theme.accent);
    document.documentElement.style.setProperty('--am-primary-soft', theme.soft);
    document.documentElement.style.setProperty('--amisearch-primary', theme.primary);
    document.documentElement.style.setProperty('--amisearch-primary-hover', theme.dark);
    document.documentElement.style.setProperty('--amisearch-primary-light', theme.soft);

    let style = document.getElementById('amisearch-dynamic-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'amisearch-dynamic-theme';
      document.head.appendChild(style);
    }
    style.textContent = `
      .btn-primary,
      button[type="submit"],
      .bg-\\[#6C5CE7\\], .bg-purple-600, .bg-indigo-600 {
        background: ${theme.primary} !important;
        background-color: ${theme.primary} !important;
      }
      .btn-primary:hover,
      button[type="submit"]:hover,
      .hover\\:bg-\\[#5A4BD1\\]:hover, .hover\\:bg-purple-700:hover, .hover\\:bg-indigo-700:hover {
        background: ${theme.dark} !important;
        background-color: ${theme.dark} !important;
      }
      .text-\\[#6C5CE7\\], .text-purple-600, .text-indigo-600,
      a.text-\\[#6C5CE7\\], button.text-\\[#6C5CE7\\] {
        color: ${theme.primary} !important;
      }
      .hover\\:text-\\[#6C5CE7\\]:hover, .hover\\:text-purple-600:hover, .hover\\:text-indigo-600:hover {
        color: ${theme.primary} !important;
      }
      .border-\\[#6C5CE7\\], .border-purple-600, .border-indigo-600 {
        border-color: ${theme.primary} !important;
      }
      .focus\\:border-\\[#6C5CE7\\]:focus {
        border-color: ${theme.primary} !important;
      }
      .bg-purple-50, .bg-indigo-50, .bg-purple-100, .bg-indigo-100 {
        background-color: ${theme.soft} !important;
      }
      .from-\\[#6C5CE7\\] { --tw-gradient-from: ${theme.primary} var(--tw-gradient-from-position) !important; --tw-gradient-to: rgb(108 92 231 / 0) var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
      .to-\\[#A29BFE\\] { --tw-gradient-to: ${theme.accent} var(--tw-gradient-to-position) !important; }
      .gradient-text {
        background: linear-gradient(135deg, ${theme.primary} 0%, ${theme.accent} 100%) !important;
        -webkit-background-clip: text !important;
        background-clip: text !important;
      }
      .theme-swatch[data-active="true"] {
        outline: 3px solid ${theme.ring} !important;
        outline-offset: 3px !important;
        transform: translateY(-1px) !important;
      }
      #themePicker { bottom: 8rem !important; z-index: 40 !important; }
    `;

    try { localStorage.setItem('amisearch-theme', themeName); } catch (_) {}
    document.querySelectorAll('.theme-swatch, #themeSwatches button, #amisearch-picker button[data-theme]').forEach((button) => {
      button.dataset.active = button.dataset.theme === themeName ? 'true' : 'false';
    });
  }

  function updatePickerLanguage() {
    const lang = currentLang();
    const panelTitle = document.querySelector('#themePickerPanel [data-hu][data-en]');
    if (panelTitle) panelTitle.textContent = panelTitle.getAttribute(lang === 'hu' ? 'data-hu' : 'data-en') || panelTitle.textContent;
    document.querySelectorAll('#themeSwatches button[data-theme]').forEach((button) => {
      const theme = themes[button.dataset.theme] || themes.purple;
      const name = lang === 'hu' ? theme.label : theme.en;
      button.setAttribute('aria-label', (lang === 'hu' ? 'Téma kiválasztása: ' : 'Choose theme: ') + name);
      button.title = name;
    });
  }

  function init() {
    window.amisearchThemes = Object.assign({}, window.amisearchThemes || {}, themes);
    window.setAmisearchTheme = applyTheme;
    window.changeSiteTheme = applyTheme;
    window.amisearchExportTextToPdf = exportTextToPdf;
    window.amisearchExportTextToDocx = exportTextToDocx;
    installStructuredExports();
    setTimeout(installStructuredExports, 0);
    setTimeout(installStructuredExports, 500);
    setTimeout(installStructuredExports, 1500);
    applyTheme(localStorage.getItem('amisearch-theme') || 'purple');
    updatePickerLanguage();
    setInterval(updatePickerLanguage, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();


// AMISEARCH TTS loader: chat toolbar buttons are detected by speech-tts.js.
(function loadAmisearchSpeechTts() {
  if (document.querySelector('script[data-amisearch-tts]')) return;
  const script = document.createElement("script");
  script.src = "/speech-tts.js?v=4";
  script.defer = true;
  script.setAttribute("data-amisearch-tts", "1");
  script.onerror = function () {
    console.error("Nem sikerült betölteni a /speech-tts.js fájlt.");
  };
  document.head.appendChild(script);
})();

// Cleaner chat answer PDF export. Keeps the rendered answer's formatting and accents.
(function installReadableAiAnswerPdf() {
  window.downloadAiAnswerPdf = async function (btn) {
    const bubble = btn && btn.closest ? btn.closest(".bg-white") : null;
    if (!bubble) {
      alert("Nem található a chatválasz.");
      return;
    }
    const jsPDF = window.jspdf && window.jspdf.jsPDF;
    if (!jsPDF || !window.html2canvas) {
      alert("A PDF-könyvtár nem töltődött be. Frissítsd az oldalt, és próbáld újra.");
      return;
    }

    const clone = bubble.cloneNode(true);
    clone.querySelectorAll("[data-ai-dl-toolbar], button").forEach(function (el) {
      el.remove();
    });
    clone.style.cssText = [
      "width:100%", "max-width:none", "padding:0", "margin:0", "border:0",
      "box-shadow:none", "background:#fff", "color:#1f2937", "font-family:Arial,sans-serif",
      "font-size:15px", "line-height:1.65", "overflow-wrap:anywhere"
    ].join(";");
    clone.querySelectorAll("p").forEach(function (p) {
      p.style.cssText += ";margin:0 0 12px;line-height:1.65";
    });
    clone.querySelectorAll("h1,h2,h3,h4").forEach(function (h) {
      h.style.cssText += ";color:#1d4ed8;margin:18px 0 8px;line-height:1.3";
    });
    clone.querySelectorAll("pre").forEach(function (pre) {
      pre.style.cssText += ";white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:10px;border-radius:6px";
    });

    const sheet = document.createElement("div");
    sheet.style.cssText = "position:fixed;left:-100000px;top:0;width:760px;padding:44px 52px;background:#fff;box-sizing:border-box;color:#1f2937";
    const header = document.createElement("div");
    header.innerHTML = '<div style="background:#1d4ed8;color:#fff;padding:14px 18px;border-radius:10px;font:bold 18px Arial,sans-serif">AMISEARCH<span style="display:block;font:12px Arial,sans-serif;margin-top:4px;opacity:.9">Tanulási segédlet</span></div><h1 style="font:700 22px Arial,sans-serif;color:#1d4ed8;margin:24px 0 6px">AI-válasz</h1><div style="font:12px Arial,sans-serif;color:#6b7280;margin-bottom:22px">' + new Date().toLocaleString("hu-HU") + '</div>';
    sheet.appendChild(header);
    sheet.appendChild(clone);
    document.body.appendChild(sheet);

    const oldText = btn.textContent;
    btn.disabled = true;
    try {
      const canvas = await window.html2canvas(sheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: Math.max(document.documentElement.clientWidth, 800)
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const printableW = pageW - margin * 2;
      const printableH = pageH - margin * 2;
      const pxPerMm = canvas.width / printableW;
      const sliceH = Math.floor(printableH * pxPerMm);
      let page = 0;
      for (let top = 0; top < canvas.height; top += sliceH) {
        if (page > 0) pdf.addPage();
        const h = Math.min(sliceH, canvas.height - top);
        const part = document.createElement("canvas");
        part.width = canvas.width;
        part.height = h;
        const ctx = part.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, part.width, part.height);
        ctx.drawImage(canvas, 0, top, canvas.width, h, 0, 0, canvas.width, h);
        pdf.addImage(part.toDataURL("image/jpeg", 0.94), "JPEG", margin, margin, printableW, h / pxPerMm, undefined, "FAST");
        page++;
      }
      const q = (btn.getAttribute("data-q") || "AI-valasz").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
      pdf.save("AMISEARCH-" + (q || "AI-valasz") + ".pdf");
    } catch (err) {
      console.error("AI answer PDF export failed:", err);
      alert("Nem sikerült elkészíteni a PDF-et. Próbáld meg újra.");
    } finally {
      sheet.remove();
      btn.disabled = false;
      if (oldText) btn.textContent = oldText;
    }
  };
})();
