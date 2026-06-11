(() => {
  'use strict';

  const themes = {
    purple: { label: 'Lila', primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', ring: '#A29BFE' },
    blue: { label: 'Kék', primary: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE', ring: '#93C5FD' },
    emerald: { label: 'Zöld', primary: '#059669', hover: '#047857', light: '#D1FAE5', ring: '#6EE7B7' },
    orange: { label: 'Narancs', primary: '#D97706', hover: '#B45309', light: '#FEF3C7', ring: '#FCD34D' }
  };

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
    label.textContent = 'Szín';
    label.style.cssText = 'font:600 13px system-ui,-apple-system,Segoe UI,sans-serif;color:#1f2937;margin-right:2px';
    picker.appendChild(label);

    Object.entries(themes).forEach(([name, theme]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.theme = name;
      button.setAttribute('aria-label', 'Téma kiválasztása: ' + theme.label);
      button.title = theme.label;
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

  function escapeText(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function injectPdfStyles() {
    if (document.getElementById('amisearch-pdf-export-style')) return;
    const style = document.createElement('style');
    style.id = 'amisearch-pdf-export-style';
    style.textContent = `
      .amisearch-pdf-stage,
      .amisearch-pdf-stage * {
        box-sizing: border-box !important;
      }
      .amisearch-pdf-stage {
        width: 760px !important;
        max-width: 760px !important;
        min-width: 760px !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-family: Inter, Arial, Helvetica, sans-serif !important;
        font-size: 15px !important;
        line-height: 1.62 !important;
        padding: 28px !important;
        overflow: visible !important;
      }
      .amisearch-pdf-stage h1,
      .amisearch-pdf-stage h2,
      .amisearch-pdf-stage h3 {
        color: #4C1D95 !important;
        line-height: 1.25 !important;
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
      .amisearch-pdf-stage p,
      .amisearch-pdf-stage li,
      .amisearch-pdf-stage .katex-display {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      .amisearch-pdf-stage .katex,
      .amisearch-pdf-stage .katex * {
        line-height: 1.35 !important;
        overflow: visible !important;
      }
      .amisearch-pdf-stage .katex-display {
        display: block !important;
        margin: 0.75em 0 !important;
        padding: 0.25em 0 !important;
        overflow: visible !important;
      }
      .amisearch-pdf-stage table {
        width: 100% !important;
        border-collapse: collapse !important;
        table-layout: fixed !important;
      }
      .amisearch-pdf-stage th,
      .amisearch-pdf-stage td {
        border: 1px solid #E5E7EB !important;
        padding: 8px !important;
        word-break: break-word !important;
      }
      .amisearch-pdf-stage img,
      .amisearch-pdf-stage svg,
      .amisearch-pdf-stage canvas {
        max-width: 100% !important;
        height: auto !important;
      }
      .amisearch-pdf-stage pre,
      .amisearch-pdf-stage code {
        white-space: pre-wrap !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
    `;
    document.head.appendChild(style);
  }

  function removeDownloadToolbar(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-ai-dl-toolbar], button, .no-print, .pdf-hide').forEach((el) => {
      const text = (el.innerText || el.textContent || '').toLowerCase();
      const looksLikeToolbar = el.hasAttribute('data-ai-dl-toolbar') ||
        text.includes('pdf') || text.includes('word') || text.includes('letölt') || text.includes('download');
      if (looksLikeToolbar) el.remove();
    });
  }

  function prepareClone(sourceEl) {
    injectPdfStyles();
    const clone = sourceEl.cloneNode(true);
    removeDownloadToolbar(clone);
    clone.classList.add('amisearch-pdf-stage');
    clone.style.position = 'absolute';
    clone.style.left = '-100000px';
    clone.style.top = '0';
    clone.style.zIndex = '-1';
    clone.style.opacity = '1';
    clone.style.transform = 'none';
    clone.style.maxHeight = 'none';
    clone.style.height = 'auto';
    clone.style.overflow = 'visible';
    document.body.appendChild(clone);
    return clone;
  }

  function renderMathIfAvailable(element) {
    if (!element || typeof window.renderMathInElement !== 'function') return;
    try {
      window.renderMathInElement(element, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false }
        ],
        throwOnError: false
      });
    } catch (_) {}
  }

  async function waitForFontsAndLayout() {
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    } catch (_) {}
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  function addHeader(pdf, pageWidth, headerHeight, title, subtitle) {
    pdf.setFillColor(108, 92, 231);
    pdf.rect(0, 0, pageWidth, headerHeight, 'F');
    pdf.setFillColor(162, 155, 254);
    pdf.circle(pageWidth - 46, 18, 32, 'F');
    pdf.setFillColor(85, 76, 199);
    pdf.circle(pageWidth - 12, 44, 44, 'F');

    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.text('AMISEARCH', 34, 30);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(subtitle || 'Tanulási segédlet', 34, 46);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    const safeTitle = String(title || 'Letöltés').slice(0, 72);
    pdf.text(safeTitle, 34, 66, { maxWidth: pageWidth - 68 });
  }

  function addFooter(pdf, pageWidth, pageHeight, pageNumber) {
    pdf.setDrawColor(229, 231, 235);
    pdf.setLineWidth(0.5);
    pdf.line(34, pageHeight - 28, pageWidth - 34, pageHeight - 28);
    pdf.setTextColor(107, 114, 128);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.text('amisearch.app', 34, pageHeight - 14);
    pdf.text(String(pageNumber), pageWidth - 40, pageHeight - 14, { align: 'right' });
  }

  async function exportElementToStyledPdf(sourceEl, options) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF || !window.html2canvas) {
      alert('PDF könyvtár hiányzik. Frissítsd az oldalt, majd próbáld újra.');
      return;
    }

    const title = options?.title || 'AMISEARCH letöltés';
    const subtitle = options?.subtitle || 'Tanulási segédlet';
    const filename = sanitizeFilename(options?.filename || title) + '.pdf';
    const clone = prepareClone(sourceEl);

    try {
      renderMathIfAvailable(clone);
      await waitForFontsAndLayout();

      const canvas = await window.html2canvas(clone, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: clone.scrollWidth,
        windowHeight: clone.scrollHeight,
        width: clone.scrollWidth,
        height: clone.scrollHeight
      });

      const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const marginX = 34;
      const headerHeight = 82;
      const footerHeight = 34;
      const topY = headerHeight + 20;
      const usableHeightPt = pageHeight - topY - footerHeight;
      const imgWidthPt = pageWidth - marginX * 2;
      const pxPerPt = canvas.width / imgWidthPt;
      const sliceHeightPx = Math.max(1, Math.floor(usableHeightPt * pxPerPt));

      let page = 1;
      let sourceY = 0;

      while (sourceY < canvas.height) {
        if (page > 1) pdf.addPage();
        addHeader(pdf, pageWidth, headerHeight, title, subtitle);
        addFooter(pdf, pageWidth, pageHeight, page);

        const currentSliceHeightPx = Math.min(sliceHeightPx, canvas.height - sourceY);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = currentSliceHeightPx;
        const ctx = sliceCanvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          sourceY,
          canvas.width,
          currentSliceHeightPx,
          0,
          0,
          canvas.width,
          currentSliceHeightPx
        );

        const sliceData = sliceCanvas.toDataURL('image/png');
        const sliceHeightPt = currentSliceHeightPx / pxPerPt;
        pdf.addImage(sliceData, 'PNG', marginX, topY, imgWidthPt, sliceHeightPt, undefined, 'FAST');
        sourceY += currentSliceHeightPx;
        page += 1;
      }

      pdf.save(filename);
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
    }
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

  function installPdfFixes() {
    window.downloadAiAnswerPdf = async function(btn) {
      const bubble = findAiBubbleFrom(btn);
      if (!bubble) return;
      const q = btn?.getAttribute?.('data-q') || 'ai-valasz';
      try {
        await exportElementToStyledPdf(bubble, {
          title: 'AI válasz',
          subtitle: 'AMISEARCH tanulási segédlet',
          filename: q
        });
      } catch (e) {
        console.error('[amisearch] AI PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };

    window.downloadPracticePdf = async function(topicName) {
      const target = document.getElementById('practiceContent');
      if (!target) return;
      const topic = topicName || 'Feladatsor';
      try {
        await exportElementToStyledPdf(target, {
          title: topic + ' — Feladatok',
          subtitle: 'Feladatok, megoldások és magyarázatok',
          filename: topic + '-feladatok'
        });
      } catch (e) {
        console.error('[amisearch] Practice PDF export hiba:', e);
        alert('PDF generálás hiba: ' + (e?.message || e));
      }
    };
  }

  window.changeSiteTheme = setTheme;
  window.amisearchExportElementToStyledPdf = exportElementToStyledPdf;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createPicker();
      installPdfFixes();
    }, { once: true });
  } else {
    createPicker();
    installPdfFixes();
  }
})();
