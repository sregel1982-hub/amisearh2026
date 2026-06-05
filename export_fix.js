function latexToUnicode(text) {
  return text
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
    .replace(/\^{([^}]*)}/g, (_, e) => toSuperscript(e))
    .replace(/\^(\d)/g, (_, e) => toSuperscript(e))
    .replace(/_{([^}]*)}/g, (_, e) => toSubscript(e))
    .replace(/_(\d)/g, (_, e) => toSubscript(e))
    .replace(/\\alpha/g,'α').replace(/\\beta/g,'β')
    .replace(/\\gamma/g,'γ').replace(/\\delta/g,'δ')
    .replace(/\\epsilon/g,'ε').replace(/\\theta/g,'θ')
    .replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ')
    .replace(/\\pi/g,'π').replace(/\\sigma/g,'σ')
    .replace(/\\omega/g,'ω').replace(/\\phi/g,'φ')
    .replace(/\\Delta/g,'Δ').replace(/\\Sigma/g,'Σ')
    .replace(/\\Omega/g,'Ω').replace(/\\infty/g,'∞')
    .replace(/\\cdot/g,'·').replace(/\\times/g,'×')
    .replace(/\\div/g,'÷').replace(/\\pm/g,'±')
    .replace(/\\leq/g,'≤').replace(/\\geq/g,'≥')
    .replace(/\\neq/g,'≠').replace(/\\approx/g,'≈')
    .replace(/\\sqrt\{([^}]*)\}/g,'√($1)')
    .replace(/\\sum/g,'Σ').replace(/\\int/g,'∫')
    .replace(/\\partial/g,'∂').replace(/\\nabla/g,'∇')
    .replace(/\\[a-zA-Z]+/g,'').replace(/[{}]/g,'')
    .replace(/\$\$([^$]+)\$\$/g,'$1').replace(/\$([^$]+)\$/g,'$1')
    .replace(/\\\[/g,'').replace(/\\\]/g,'')
    .replace(/\\\(/g,'').replace(/\\\)/g,'');
}

function toSuperscript(str) {
  const m={'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ'};
  return str.split('').map(c=>m[c]||c).join('');
}

function toSubscript(str) {
  const m={'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
  return str.split('').map(c=>m[c]||c).join('');
}

// ── HTML → PDF (html2canvas módszer, minden karakter helyes) ────

async function elementToPdf(el, filename, title) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('jsPDF hiányzik.'); return; }
  if (typeof html2canvas === 'undefined') { alert('html2canvas hiányzik.'); return; }

  // Toolbar ideiglenes elrejtése
  const toolbar = el.querySelector('[data-ai-dl-toolbar]');
  if (toolbar) toolbar.style.display = 'none';

  // KaTeX annotation cleanup (hogy ne duplázódjon a szöveg)
  el.querySelectorAll('.katex-html').forEach(k => { k.style.display = 'none'; });

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
    windowWidth: el.scrollWidth + 40
  });

  // Visszaállítás
  if (toolbar) toolbar.style.display = '';
  el.querySelectorAll('.katex-html').forEach(k => { k.style.display = ''; });

  const imgData = canvas.toDataURL('image/png');
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;
  const contentW = pageW - margin * 2;

  // Fejléc
  doc.setFillColor(108, 92, 231);
  doc.rect(0, 0, pageW, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('AMISEARCH', margin, 9);
  doc.setTextColor(40, 40, 40);

  const startY = 15;
  const imgW = contentW;
  const imgH = (canvas.height / canvas.width) * imgW;
  const availH = pageH - startY - 8; // lábléc helye

  if (imgH <= availH) {
    // Elfér egy oldalon
    doc.addImage(imgData, 'PNG', margin, startY, imgW, imgH);
  } else {
    // Több oldalra tördelés
    const ratio = canvas.width / imgW;
    let srcY = 0;
    let pageNum = 0;
    while (srcY < canvas.height) {
      if (pageNum > 0) doc.addPage();
      const sliceH = Math.min(availH * ratio, canvas.height - srcY);
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = sliceH;
      const ctx = sliceCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const sliceData = sliceCanvas.toDataURL('image/png');
      const sliceDisplayH = sliceH / ratio;
      doc.addImage(sliceData, 'PNG', margin, startY, imgW, sliceDisplayH);
      srcY += sliceH;
      pageNum++;
    }
  }

  // Lábléc minden oldalra
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(180,180,180);
    doc.text('AMISEARCH • ' + i + '/' + n, pageW - margin, pageH - 4, { align: 'right' });
    doc.text(new Date().toLocaleDateString('hu-HU'), margin, pageH - 4);
  }

  doc.save(filename + '.pdf');
}

// ── RTF (Word) – ékezetek unicode escape-pel ─────────────────

function extractTextLines(el) {
  const clone = el.cloneNode(true);
  const tb = clone.querySelector('[data-ai-dl-toolbar]');
  if (tb) tb.remove();
  clone.querySelectorAll('.katex').forEach(k => {
    const latex = k.querySelector('annotation')?.textContent || k.innerText || '';
    k.replaceWith(document.createTextNode(latexToUnicode(latex)));
  });
  clone.querySelectorAll('p,div,h1,h2,h3,h4,li,br').forEach(e => {
    e.insertAdjacentText('beforebegin', '\n');
  });
  return (clone.innerText || clone.textContent || '');
}

function buildRtf(title, textLines) {
  const lines = textLines.split('\n').filter(l => l.trim());

  let rtf = '{\\rtf1\\ansi\\ansicpg1250\\deff0\n';
  rtf += '{\\fonttbl{\\f0\\froman\\fcharset238 Times New Roman;}{\\f1\\fswiss\\fcharset238 Arial;}}\n';
  rtf += '{\\colortbl;\\red108\\green92\\blue231;\\red60\\green130\\blue60;\\red40\\green40\\blue40;}\n';
  rtf += '\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\n';

  const escStr = str => str.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code > 127) return '\\u' + code + '?';
    if (c === '\\') return '\\\\';
    if (c === '{') return '\\{';
    if (c === '}') return '\\}';
    return c;
  }).join('');

  rtf += '\\pard\\sb200\\sa100\\f1\\fs28\\b\\cf1 ' + escStr(title) + '\\b0\\par\n';

  lines.forEach(line => {
    const t = line.trim();
    if (!t) { rtf += '\\par\n'; return; }
    const clean = t.replace(/\*\*/g,'').replace(/^#+\s*/,'');
    const esc = escStr(clean);
    const isH = /^#{1,3}\s/.test(t) || /^[0-9]+\.\s*(Feladat|Task|Problem)/i.test(t);
    const isSol = /^#{3,4}\s*(Megoldás|Solution)/i.test(t);
    if (isH) rtf += '\\pard\\sb200\\sa80\\f1\\fs24\\b\\cf1 ' + esc + '\\b0\\par\n';
    else if (isSol) rtf += '\\pard\\sb60\\sa60\\f1\\fs20\\i\\cf2 ' + esc + '\\i0\\par\n';
    else rtf += '\\pard\\sb40\\sa40\\f0\\fs20\\cf3 ' + esc + '\\par\n';
  });

  rtf += '}';
  return rtf;
}

// ── FELADAT GENERÁTOR ────────────────────────────────────────

window.downloadPracticePdf = async function(topicName) {
  const target = document.getElementById('practiceContent');
  if (!target) return;
  const title = 'AMISEARCH — ' + (topicName||'Feladatok');
  await elementToPdf(target, (topicName||'feladatok') + '-feladatok', title);
};

window.downloadPracticeWord = function(topicName) {
  const target = document.getElementById('practiceContent');
  if (!target) return;
  const title = 'AMISEARCH — ' + (topicName||'Feladatok') + ' — Feladatok';
  const rtf = buildRtf(title, extractTextLines(target));
  const blob = new Blob([rtf], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (topicName||'feladatok') + '-feladatok.rtf';
  a.click();
  URL.revokeObjectURL(url);
};

// ── AI CHAT ──────────────────────────────────────────────────

window.downloadAiAnswerPdf = async function(btn) {
  const bubble = btn.closest('.bg-white');
  if (!bubble) return;
  const q = btn.getAttribute('data-q') || 'ai-valasz';
  const title = 'AMISEARCH — AI válasz';
  await elementToPdf(bubble, (window.sanitizeFilename ? window.sanitizeFilename(q) : q), title);
};

window.downloadAiAnswerWord = async function(btn) {
  const bubble = btn.closest('.bg-white');
  if (!bubble) return;
  const q = btn.getAttribute('data-q') || 'ai-valasz';
  const title = 'AMISEARCH — AI válasz';
  const rtf = buildRtf(title, extractTextLines(bubble));
  const blob = new Blob([rtf], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (window.sanitizeFilename ? window.sanitizeFilename(q) : q) + '.rtf';
  a.click();
  URL.revokeObjectURL(url);
};
