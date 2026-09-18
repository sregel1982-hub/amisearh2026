// ai-pdf-export.js – AMISEARCH szép PDF export (nem képernyőkép)
// Használat: <script src="/ai-pdf-export.js" defer></script>

(function () {
  'use strict';

  function formatForExport(text) {
    if (!text) return '';
    return String(text)
      .normalize('NFC')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/([^\n])(#{1,6}\s+)/g, '$1\n\n$2')
      .replace(/(#{1,6}\s+[^\n]+)/g, '\n$1\n')
      .replace(/([^\n])(\n?[•\-\*]\s+)/g, '$1\n$2')
      .replace(/([^\n])(\n?\d+\.\s+)/g, '$1\n$2')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function getBubbleText(bubble) {
    if (typeof window._aiBubbleText === 'function') {
      return window._aiBubbleText(bubble);
    }
    const clone = bubble.cloneNode(true);
    const tb = clone.querySelector('[data-ai-dl-toolbar]');
    if (tb) tb.remove();
    return clone.innerText || clone.textContent || '';
  }

  window.downloadAiAnswerPdf = async function (btn) {
    const bubble = (typeof window._findAiBubbleFrom === 'function')
      ? window._findAiBubbleFrom(btn)
      : btn.closest('.ai-message, .chat-message, .message, [data-ai-bubble], .prose');

    if (!bubble) {
      alert('Nem található a válasz.');
      return;
    }

    const q = btn.getAttribute('data-q') || 'ai-valasz';

    try {
      const rawText = getBubbleText(bubble);
      const clean = formatForExport(rawText);

      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) {
        alert('jsPDF könyvtár hiányzik.');
        return;
      }

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 40;
      const maxWidth = pageWidth - margin * 2;
      let y = margin;

      // Cím
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(196, 30, 58);
      pdf.text('AMISEARCH — AI válasz', margin, y);
      y += 22;

      // Dátum
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(100);
      pdf.text(new Date().toLocaleString('hu-HU'), margin, y);
      y += 24;

      pdf.setTextColor(30);
      pdf.setFontSize(11);

      const lines = pdf.splitTextToSize(clean, maxWidth);
      const lineHeight = 15;

      for (let i = 0; i < lines.length; i++) {
        if (y > pageHeight - margin - 20) {
          pdf.addPage();
          y = margin;
        }

        const line = lines[i];

        if (line.startsWith('## ')) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(13);
          pdf.setTextColor(30, 58, 138);
          pdf.text(line.replace(/^##\s+/, ''), margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
          pdf.setTextColor(30);
          y += 18;
        } else if (line.startsWith('### ')) {
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(12);
          pdf.setTextColor(30, 64, 175);
          pdf.text(line.replace(/^###\s+/, ''), margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(11);
          pdf.setTextColor(30);
          y += 16;
        } else {
          pdf.text(line, margin, y);
          y += lineHeight;
        }
      }

      // Lábléc minden oldalon
      const pageCount = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.text(
          'AMISEARCH tanulási segédlet · amisearch.org',
          margin,
          pageHeight - 20
        );
      }

      const filename = (window.sanitizeFilename
        ? window.sanitizeFilename(q)
        : q.replace(/[^a-zA-Z0-9_-]/g, '_')) + '.pdf';

      pdf.save(filename);

    } catch (e) {
      console.error('PDF hiba:', e);
      alert('PDF generálás hiba: ' + (e?.message || e));
    }
  };

  console.log('[AMISEARCH] ai-pdf-export.js betöltve – szép PDF export aktív');
})();
