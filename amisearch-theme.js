(function () {
  'use strict';

  const themes = {
    purple: { label: 'Lila', en: 'Purple', primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', ring: '#A29BFE' },
    blue: { label: 'Kék', en: 'Blue', primary: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE', ring: '#93C5FD' },
    emerald: { label: 'Zöld', en: 'Green', primary: '#059669', hover: '#047857', light: '#D1FAE5', ring: '#6EE7B7' },
    orange: { label: 'Narancs', en: 'Orange', primary: '#D97706', hover: '#B45309', light: '#FEF3C7', ring: '#FCD34D' }
  };

  function currentLang() {
    return window.currentLang === 'en' ? 'en' : 'hu';
  }

  function setTheme(themeName) {
    const theme = themes[themeName] || themes.purple;
    let style = document.getElementById('amisearch-dynamic-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'amisearch-dynamic-theme';
      document.head.appendChild(style);
    }

    style.textContent = `
      :root {
        --amisearch-primary: ${theme.primary};
        --amisearch-primary-hover: ${theme.hover};
        --amisearch-primary-light: ${theme.light};
      }
      .btn-primary,
      .bg-\[\#6C5CE7\],
      .bg-purple-600,
      .bg-indigo-600,
      button[type="submit"] {
        background: ${theme.primary} !important;
        background-color: ${theme.primary} !important;
      }
      .btn-primary:hover,
      .bg-purple-600:hover,
      .bg-indigo-600:hover,
      button[type="submit"]:hover {
        background: ${theme.hover} !important;
        background-color: ${theme.hover} !important;
      }
      .text-\[\#6C5CE7\],
      .text-purple-600,
      .text-indigo-600 {
        color: ${theme.primary} !important;
      }
      .border-\[\#6C5CE7\],
      .border-purple-600,
      .border-indigo-600 {
        border-color: ${theme.primary} !important;
      }
      .bg-purple-50,
      .bg-indigo-50 {
        background-color: ${theme.light} !important;
      }
      #amisearch-picker button[data-active="true"] {
        outline: 3px solid ${theme.ring};
        outline-offset: 2px;
      }
    `;

    try { localStorage.setItem('amisearch-theme', themeName); } catch (_) {}
    document.querySelectorAll('#amisearch-picker button').forEach((button) => {
      button.dataset.active = button.dataset.theme === themeName ? 'true' : 'false';
    });
  }

  function updatePickerLanguage() {
    const picker = document.getElementById('amisearch-picker');
    if (!picker) return;
    const lang = currentLang();
    const label = picker.querySelector('[data-theme-picker-label]');
    if (label) label.textContent = lang === 'hu' ? 'Szín' : 'Color';
    picker.querySelectorAll('button[data-theme]').forEach((button) => {
      const theme = themes[button.dataset.theme] || themes.purple;
      const name = lang === 'hu' ? theme.label : theme.en;
      button.setAttribute('aria-label', (lang === 'hu' ? 'Téma kiválasztása: ' : 'Choose theme: ') + name);
      button.title = name;
    });
  }

  function createPicker() {
    if (document.getElementById('amisearch-picker')) return;

    const picker = document.createElement('section');
    picker.id = 'amisearch-picker';
    picker.setAttribute('aria-label', 'AMISEARCH színválasztó');
    picker.setAttribute('role', 'group');
    picker.style.cssText = [
      'position:fixed',
      'right:16px',
      'bottom:16px',
      'z-index:10000',
      'display:flex',
      'gap:10px',
      'align-items:center',
      'background:#ffffff',
      'padding:10px 12px',
      'border:2px solid #6C5CE7',
      'border-radius:999px',
      'box-shadow:0 8px 24px rgba(45,52,54,.18)'
    ].join(';');

    const label = document.createElement('span');
    label.dataset.themePickerLabel = 'true';
    label.textContent = currentLang() === 'hu' ? 'Szín' : 'Color';
    label.style.cssText = 'font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2937;margin-right:2px';
    picker.appendChild(label);

    Object.entries(themes).forEach(([name, theme]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.theme = name;
      button.style.cssText = [
        'width:28px',
        'height:28px',
        'border-radius:999px',
        'border:2px solid #ffffff',
        'background:' + theme.primary,
        'cursor:pointer',
        'box-shadow:0 1px 4px rgba(0,0,0,.25)'
      ].join(';');
      button.addEventListener('click', () => setTheme(name));
      picker.appendChild(button);
    });

    document.body.appendChild(picker);
    let saved = 'purple';
    try { saved = localStorage.getItem('amisearch-theme') || 'purple'; } catch (_) {}
    setTheme(themes[saved] ? saved : 'purple');
    updatePickerLanguage();
  }

  function sanitizeFilename(name) {
    const fallback = 'amisearch-letoltes';
    const raw = String(name || fallback).trim() || fallback;
    if (window.sanitizeFilename) {
      try { return window.sanitizeFilename(raw); } catch (_) {}
    }
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
        const existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('Nem tölthető be: ' + src)), { once: true });
          setTimeout(() => { if (!testFn || testFn()) resolve(); }, 300);
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Nem tölthető be: ' + src));
        document.head.appendChild(script);
      } catch (e) { reject(e); }
    });
  }

  async function ensurePdfMake() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js', () => !!window.pdfMake);
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js', () => !!(window.pdfMake && window.pdfMake.vfs));
  }

  async function ensureDocx() {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js', () => !!window.docx);
  }

  function removeExportControls(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-ai-dl-toolbar], #practiceToolbar, #examToolbar, button, .no-print, .pdf-hide').forEach((el) => {
      const txt = (el.innerText || el.textContent || '').toLowerCase();
      if (el.hasAttribute('data-ai-dl-toolbar') || /pdf|word|letölt|download|másol|copy/.test(txt)) el.remove();
    });
  }

  function elementToText(sourceEl) {
    if (!sourceEl) return '';
    const clone = sourceEl.cloneNode(true);
    removeExportControls(clone);
    clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
    clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'));
    clone.querySelectorAll('h1,h2,h3,h4,p,li,pre,blockquote,table').forEach((el) => {
      if (el.tagName === 'LI') el.prepend('• ');
      el.appendChild(document.createTextNode('\n'));
    });
    return (clone.innerText || clone.textContent || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function extractTitleLine(text, fallback) {
    const first = String(text || '').split('\n').map(s => s.trim()).find(Boolean);
    return (first || fallback || 'AMISEARCH dokumentum').slice(0, 120);
  }

  function textToPdfContent(text) {
    const lines = String(text || '').split('\n');
    const content = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        content.push({ text: ' ', margin: [0, 2, 0, 2] });
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        const level = (line.match(/^#+/) || ['#'])[0].length;
        content.push({ text: line.replace(/^#{1,4}\s+/, ''), style: level <= 2 ? 'sectionHeader' : 'subHeader', margin: [0, 12, 0, 5] });
      } else if (/^(\d+[.)]|[-*•])\s+/.test(line)) {
        content.push({ text: line, style: 'body', margin: [12, 2, 0, 3] });
      } else if (/^[-–—]{3,}$/.test(line)) {
        content.push({ canvas: [{ type: 'line', x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, lineColor: '#E5E7EB' }], margin: [0, 6, 0, 6] });
      } else {
        content.push({ text: line, style: 'body', margin: [0, 2, 0, 4] });
      }
    }
    return content;
  }

  async function exportTextToPdf(text, opts) {
    await ensurePdfMake();
    const lang = currentLang();
    const title = opts?.title || extractTitleLine(text, 'AMISEARCH');
    const subtitle = opts?.subtitle || (lang === 'hu' ? 'Tanulási segédlet' : 'Study document');
    const filename = sanitizeFilename(opts?.filename || title) + '.pdf';
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [42, 92, 42, 54],
      info: { title: title, author: 'AMISEARCH' },
      header: function () {
        return {
          margin: [42, 24, 42, 0],
          stack: [
            { canvas: [{ type: 'rect', x: 0, y: 0, w: 511, h: 50, r: 12, color: '#6C5CE7' }] },
            { text: 'AMISEARCH', color: '#FFFFFF', bold: true, fontSize: 18, absolutePosition: { x: 62, y: 36 } },
            { text: subtitle, color: '#F3F0FF', fontSize: 9, absolutePosition: { x: 62, y: 58 } }
          ]
        };
      },
      footer: function (currentPage, pageCount) {
        return { columns: [
          { text: 'amisearch.org', color: '#6B7280', fontSize: 8, margin: [42, 14, 0, 0] },
          { text: currentPage + ' / ' + pageCount, alignment: 'right', color: '#6B7280', fontSize: 8, margin: [0, 14, 42, 0] }
        ] };
      },
      content: [
        { text: title, style: 'title', margin: [0, 0, 0, 12] },
        { text: new Date().toLocaleString(lang === 'hu' ? 'hu-HU' : 'en-US'), style: 'meta', margin: [0, 0, 0, 14] },
        ...textToPdfContent(text)
      ],
      styles: {
        title: { fontSize: 20, bold: true, color: '#4C1D95' },
        sectionHeader: { fontSize: 15, bold: true, color: '#5A4BD1' },
        subHeader: { fontSize: 13, bold: true, color: '#111827' },
        body: { fontSize: 10.5, lineHeight: 1.35, color: '#111827' },
        meta: { fontSize: 8.5, color: '#6B7280' }
      },
      defaultStyle: { font: 'Roboto' }
    };
    window.pdfMake.createPdf(docDefinition).download(filename);
  }

  function textToDocxParagraphs(text) {
    const d = window.docx;
    const P = d.Paragraph;
    const R = d.TextRun;
    const H = d.HeadingLevel;
    const paragraphs = [];
    for (const raw of String(text || '').split('\n')) {
      const line = raw.trim();
      if (!line) {
        paragraphs.push(new P({ text: '', spacing: { after: 120 } }));
        continue;
      }
      if (/^#{1,4}\s+/.test(line)) {
        paragraphs.push(new P({ text: line.replace(/^#{1,4}\s+/, ''), heading: H.HEADING_2, spacing: { before: 220, after: 100 } }));
      } else if (/^(\d+[.)]|[-*•])\s+/.test(line)) {
        paragraphs.push(new P({ children: [new R({ text: line, size: 22 })], indent: { left: 360 }, spacing: { after: 80 } }));
      } else {
        paragraphs.push(new P({ children: [new R({ text: line, size: 22 })], spacing: { after: 90 } }));
      }
    }
    return paragraphs;
  }

  async function exportTextToDocx(text, opts) {
    await ensureDocx();
    const d = window.docx;
    const title = opts?.title || extractTitleLine(text, 'AMISEARCH');
    const filename = sanitizeFilename(opts?.filename || title) + '.docx';
    const doc = new d.Document({
      creator: 'AMISEARCH',
      title: title,
      description: 'AMISEARCH export',
      sections: [{
        properties: {
          page: { margin: { top: 900, right: 850, bottom: 850, left: 850 } }
        },
        children: [
          new d.Paragraph({
            children: [new d.TextRun({ text: 'AMISEARCH', bold: true, color: '6C5CE7', size: 34 })],
            spacing: { after: 120 }
          }),
          new d.Paragraph({
            children: [new d.TextRun({ text: title, bold: true, color: '4C1D95', size: 30 })],
            spacing: { after: 120 }
          }),
          new d.Paragraph({
            children: [new d.TextRun({ text: new Date().toLocaleString(currentLang() === 'hu' ? 'hu-HU' : 'en-US'), color: '6B7280', size: 18 })],
            spacing: { after: 260 }
          }),
          ...textToDocxParagraphs(text)
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
    URL.revokeObjectURL(url);
  }

  function findAiBubbleFrom(btn) {
    if (typeof window._findAiBubbleFrom === 'function') {
      try {
        const found = window._findAiBubbleFrom(btn);
        if (found) return found;
      } catch (_) {}
    }
    return btn?.closest?.('.ai-message, .chat-message, .message, .prose, [data-ai-bubble]') ||
      btn?.parentElement?.closest?.('div') ||
      btn?.parentElement ||
      null;
  }

  function installStructuredExports() {
    window.downloadAiAnswerPdf = async function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try {
        const text = elementToText(bubble);
        await exportTextToPdf(text, { title: currentLang() === 'hu' ? 'AI válasz' : 'AI answer', subtitle: currentLang() === 'hu' ? 'AMISEARCH tanulási segédlet' : 'AMISEARCH study document', filename: q });
      } catch (e) {
        console.error('[amisearch] AI PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadAiAnswerWord = async function (btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try {
        const text = elementToText(bubble);
        await exportTextToDocx(text, { title: currentLang() === 'hu' ? 'AI válasz' : 'AI answer', filename: q });
      } catch (e) {
        console.error('[amisearch] AI Word export hiba:', e);
        alert('Word generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadPracticePdf = async function (topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = topicName || (currentLang() === 'hu' ? 'Feladatsor' : 'Practice sheet');
      try {
        await exportTextToPdf(elementToText(target), { title: topic + (currentLang() === 'hu' ? ' — Feladatok' : ' — Tasks'), subtitle: currentLang() === 'hu' ? 'Feladatok, megoldások és magyarázatok' : 'Tasks, solutions and explanations', filename: topic + '-feladatok' });
      } catch (e) {
        console.error('[amisearch] Practice PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadPracticeWord = async function (topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = topicName || (currentLang() === 'hu' ? 'Feladatsor' : 'Practice sheet');
      try {
        await exportTextToDocx(elementToText(target), { title: topic + (currentLang() === 'hu' ? ' — Feladatok' : ' — Tasks'), filename: topic + '-feladatok' });
      } catch (e) {
        console.error('[amisearch] Practice Word export hiba:', e);
        alert('Word generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadExamPdf = async function (topicName) {
      const target = document.getElementById('examContent');
      if (!target) return;
      const topic = topicName || (currentLang() === 'hu' ? 'Vizsgaszimulátor' : 'Exam simulator');
      try {
        await exportTextToPdf(elementToText(target), { title: topic, subtitle: currentLang() === 'hu' ? 'Vizsgaszimulátor feladatsor' : 'Exam simulator sheet', filename: topic + '-vizsga' });
      } catch (e) {
        console.error('[amisearch] Exam PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadExamWord = async function (topicName) {
      const target = document.getElementById('examContent');
      if (!target) return;
      const topic = topicName || (currentLang() === 'hu' ? 'Vizsgaszimulátor' : 'Exam simulator');
      try {
        await exportTextToDocx(elementToText(target), { title: topic, filename: topic + '-vizsga' });
      } catch (e) {
        console.error('[amisearch] Exam Word export hiba:', e);
        alert('Word generálás hiba: ' + (e?.message || e));
      }
    };
  }

  window.changeSiteTheme = setTheme;
  window.amisearchExportTextToPdf = exportTextToPdf;
  window.amisearchExportTextToDocx = exportTextToDocx;

  function init() {
    createPicker();
    installStructuredExports();
    updatePickerLanguage();
    setInterval(updatePickerLanguage, 1200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
