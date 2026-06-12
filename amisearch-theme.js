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

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\u2018\u2019]/g, '’')
      .replace(/[\u201C\u201D]/g, '”')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
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

  function elementToText(sourceEl) {
    if (!sourceEl) return '';
    const clone = sourceEl.cloneNode(true);
    removeExportControls(clone);
    clone.querySelectorAll('script, style, noscript, svg, canvas').forEach((el) => el.remove());
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,table,section,article').forEach((el) => {
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
      pageMargins: [42, 96, 42, 56],
      info: { title: title, author: BRAND, subject: subtitle, creator: BRAND },
      defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.35, color: '#111827' },
      header: function () {
        return {
          margin: [42, 22, 42, 0],
          stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 511, h: 54, r: 12, color: theme.primary }] },
            { text: BRAND, color: '#FFFFFF', bold: true, fontSize: 19, absolutePosition: { x: 62, y: 35 } },
            { text: subtitle, color: '#F8FAFC', fontSize: 9, absolutePosition: { x: 62, y: 59 } }
          ]
        };
      },
      footer: function (currentPage, pageCount) {
        return { columns: [
          { text: 'amisearch.org', color: '#6B7280', fontSize: 8, margin: [42, 16, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', color: '#6B7280', fontSize: 8, margin: [0, 16, 42, 0] }
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
        properties: { page: { margin: { top: 900, right: 850, bottom: 850, left: 850 } } },
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
      .bg-\[\#6C5CE7\], .bg-purple-600, .bg-indigo-600 {
        background: ${theme.primary} !important;
        background-color: ${theme.primary} !important;
      }
      .btn-primary:hover,
      button[type="submit"]:hover,
      .hover\:bg-\[\#5A4BD1\]:hover, .hover\:bg-purple-700:hover, .hover\:bg-indigo-700:hover {
        background: ${theme.dark} !important;
        background-color: ${theme.dark} !important;
      }
      .text-\[\#6C5CE7\], .text-purple-600, .text-indigo-600,
      a.text-\[\#6C5CE7\], button.text-\[\#6C5CE7\] {
        color: ${theme.primary} !important;
      }
      .hover\:text-\[\#6C5CE7\]:hover, .hover\:text-purple-600:hover, .hover\:text-indigo-600:hover {
        color: ${theme.primary} !important;
      }
      .border-\[\#6C5CE7\], .border-purple-600, .border-indigo-600 {
        border-color: ${theme.primary} !important;
      }
      .focus\:border-\[\#6C5CE7\]:focus {
        border-color: ${theme.primary} !important;
      }
      .bg-purple-50, .bg-indigo-50, .bg-purple-100, .bg-indigo-100 {
        background-color: ${theme.soft} !important;
      }
      .from-\[\#6C5CE7\] { --tw-gradient-from: ${theme.primary} var(--tw-gradient-from-position) !important; --tw-gradient-to: rgb(108 92 231 / 0) var(--tw-gradient-to-position) !important; --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to) !important; }
      .to-\[\#A29BFE\] { --tw-gradient-to: ${theme.accent} var(--tw-gradient-to-position) !important; }
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
      #themePicker { bottom: 6rem !important; z-index: 40 !important; }
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
