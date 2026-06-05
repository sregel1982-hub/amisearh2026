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

// Magyar és speciális karakterek biztonságos kódolása PDF-hez
function safeChar(c) {
  const code = c.charCodeAt(0);
  if (code < 128) return c;
  // Latin Extended-A és B (magyar ékezetes betűk)
  const map = {
    'á':'á','é':'é','í':'í','ó':'ó','ö':'ö','ő':'ő','ú':'ú','ü':'ü','ű':'ű',
    'Á':'Á','É':'É','Í':'Í','Ó':'Ó','Ö':'Ö','Ő':'Ő','Ú':'Ú','Ü':'Ü','Ű':'Ű',
    'α':'α','β':'β','γ':'γ','δ':'δ','ε':'ε','θ':'θ','λ':'λ','μ':'μ',
    'π':'π','σ':'σ','ω':'ω','φ':'φ','Δ':'Δ','Σ':'Σ','Ω':'Ω','∞':'inf',
    '·':'*','×':'x','÷':'/','±':'+-','≤':'<=','≥':'>=','≠':'!=','≈':'~=',
    '√':'sqrt','∫':'int','∂':'d','∇':'nabla',
    '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9',
    '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9',
  };
  return map[c] || c;
}

function encodeLine(str) {
  return str.split('').map(safeChar).join('');
}

async function mermaidSvgToPngDataUrl(svgEl) {
  return new Promise((resolve) => {
    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 800;
        canvas.height = img.height || 400;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    } catch(e) { resolve(null); }
  });
}

async function buildPdf(title, subtitle, textLines, sourceEl) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { alert('jsPDF hiányzik.'); return null; }

  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxW = pageW - margin * 2;
  let y = 20;

  // Fejléc sáv
  doc.setFillColor(108, 92, 231);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(encodeLine(title), margin, 10);
  doc.setTextColor(40, 40, 40);

  // Mermaid SVG képek begyűjtése
  const mermaidImages = [];
  if (sourceEl) {
    const svgEls = sourceEl.querySelectorAll('.mermaid svg, [data-processed="true"] svg');
    for (const svgEl of svgEls) {
      const pngUrl = await mermaidSvgToPngDataUrl(svgEl);
      if (pngUrl) mermaidImages.push(pngUrl);
    }
  }

  // Ha van Mermaid kép, képként szúrjuk be először
  for (const imgUrl of mermaidImages) {
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    const imgW = maxW;
    const imgH = 80; // fix magasság, arányos
    doc.addImage(imgUrl, 'PNG', margin, y, imgW, imgH);
    y += imgH + 5;
  }

  const lines = textLines.split('\n').filter(l => l.trim());

  lines.forEach(line => {
    const t = line.trim();
    if (!t) return;
    if (y > pageH - margin) { doc.addPage(); y = margin; }

    const isH = /^#{1,3}\s/.test(t) || /^[0-9]+\.\s*(Feladat|Task|Problem)/i.test(t);
    const isSol = /^#{3,4}\s*(Megoldás|Solution)/i.test(t);
    // Mermaid szöveges blokkokat hagyjuk ki (csak az SVG képet vesszük)
    const isMermaid = /^```mermaid/.test(t) || /^mindmap/.test(t) || /^graph/.test(t) || /^flowchart/.test(t);
    if (isMermaid && mermaidImages.length > 0) return;

    const clean = encodeLine(t.replace(/\*\*/g,'').replace(/^#+\s*/,''));

    if (isH) {
      y += 3;
      doc.setFontSize(12); doc.setFont('helvetica','bold');
      doc.setTextColor(108, 92, 231);
    } else if (isSol) {
      doc.setFontSize(10); doc.setFont('helvetica','bolditalic');
      doc.setTextColor(60, 130, 60);
    } else {
      doc.setFontSize(10); doc.setFont('helvetica','normal');
      doc.setTextColor(40, 40, 40);
    }

    const wrapped = doc.splitTextToSize(clean, maxW);
    wrapped.forEach(wl => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(wl, margin, y);
      y += isH ? 7 : 5.5;
    });
  });

  // Lábléc
  const n = doc.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(180,180,180);
    doc.text('AMISEARCH • ' + i + '/' + n, pageW - margin, pageH - 6, { align: 'right' });
    doc.text(new Date().toLocaleDateString('hu-HU'), margin, pageH - 6);
  }

  return doc;
}

function buildRtf(title, textLines) {
  const lines = textLines.split('\n').filter(l => l.trim());

  let rtf = '{\\rtf1\\ansi\\ansicpg1250\\deff0\n';
  rtf += '{\\fonttbl{\\f0\\froman\\fcharset238 Times New Roman;}{\\f1\\fswiss\\fcharset238 Arial;}}\n';
  rtf += '{\\colortbl;\\red108\\green92\\blue231;\\red60\\green130\\blue60;\\red40\\green40\\blue40;}\n';
  rtf += '\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\n';
  rtf += '{\\header\\pard\\qr\\f1\\fs16\\cf3 AMISEARCH\\par}\n';

  const escapedTitle = title.split('').map(c => {
    const code = c.charCodeAt(0);
    if (code > 127) return '\\u' + code + '?';
    return c;
  }).join('');
  rtf += '\\pard\\sb200\\sa100\\f1\\fs28\\b\\cf1 ' + escapedTitle + '\\b0\\par\n';

  lines.forEach(line => {
    const t = line.trim();
    if (!t) { rtf += '\\par\n'; return; }
    const clean = t.replace(/\*\*/g,'').replace(/^#+\s*/,'');
    const esc = clean.split('').map(c => {
      const code = c.charCodeAt(0);
      if (code > 127) return '\\u' + code + '?';
      if (c === '\\') return '\\\\';
      if (c === '{') return '\\{';
      if (c === '}') return '\\}';
      return c;
    }).join('');

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
  const title = 'AMISEARCH — ' + (topicName||'Feladatok') + ' — Feladatok';
  const doc = await buildPdf(title, '', extractTextLines(target), target);
  if (doc) doc.save((topicName||'feladatok') + '-feladatok.pdf');
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
  const doc = await buildPdf(title, '', extractTextLines(bubble), bubble);
  if (doc) doc.save((window.sanitizeFilename ? window.sanitizeFilename(q) : q) + '.pdf');
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
