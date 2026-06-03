 window.addEventListener('load', function() {
  return text
    .replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '($1)/($2)')
    .replace(/\^{([^}]*)}/g, (_, e) => toSuperscript(e))
    .replace(/\^(\d)/g, (_, e) => toSuperscript(e))
    .replace(/_{([^}]*)}/g, (_, e) => toSubscript(e))
    .replace(/_(\d)/g, (_, e) => toSubscript(e))
    .replace(/\\alpha/g, 'α').replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ').replace(/\\delta/g, 'δ')
    .replace(/\\epsilon/g, 'ε').replace(/\\theta/g, 'θ')
    .replace(/\\lambda/g, 'λ').replace(/\\mu/g, 'μ')
    .replace(/\\pi/g, 'π').replace(/\\sigma/g, 'σ')
    .replace(/\\omega/g, 'ω').replace(/\\phi/g, 'φ')
    .replace(/\\Delta/g, 'Δ').replace(/\\Sigma/g, 'Σ')
    .replace(/\\Omega/g, 'Ω').replace(/\\infty/g, '∞')
    .replace(/\\cdot/g, '·').replace(/\\times/g, '×')
    .replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤').replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠').replace(/\\approx/g, '≈')
    .replace(/\\sqrt\{([^}]*)\}/g, '√($1)')
    .replace(/\\sum/g, 'Σ').replace(/\\int/g, '∫')
    .replace(/\\partial/g, '∂').replace(/\\nabla/g, '∇')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\$\$([^$]+)\$\$/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\\[/g, '').replace(/\\\]/g, '')
    .replace(/\\\(/g, '').replace(/\\\)/g, '');
}

function toSuperscript(str) {
  const map = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','n':'ⁿ'};
  return str.split('').map(c => map[c] || c).join('');
}

function toSubscript(str) {
  const map = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
  return str.split('').map(c => map[c] || c).join('');
}

function extractTextLines(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  tmp.querySelectorAll('.katex').forEach(el => {
    const latex = el.querySelector('[data-latex]')?.getAttribute('data-latex')
      || el.querySelector('annotation')?.textContent
      || el.innerText;
    el.replaceWith(document.createTextNode(latexToUnicode(latex)));
  });
  tmp.querySelectorAll('p, div, h1, h2, h3, h4, li, br').forEach(el => {
    el.insertAdjacentText('beforebegin', '\n');
  });
  return tmp.innerText || tmp.textContent;
}

window.downloadPDF = function() {
  const output = document.getElementById('practiceOutput');
  if (!output || output.innerText.trim() === '' || output.querySelector('.italic')) {
    alert('Először generálj feladatokat!');
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;
  const maxW = pageW - margin * 2;
  let y = 20;
  doc.setFillColor(108, 92, 231);
  doc.rect(0, 0, pageW, 14, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AMISEARCH – Feladat generátor', margin, 10);
  doc.setTextColor(40, 40, 40);
  const rawText = extractTextLines(output.innerHTML);
  const lines = rawText.split('\n').filter(l => l.trim() !== '');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (y > pageH - margin) { doc.addPage(); y = margin; }
    const isHeading = /^(#+\s|\*\*|[0-9]+\.\s*(Feladat|Task|Megoldás|Solution))/i.test(trimmed);
    const isSolution = /megoldás|solution/i.test(trimmed);
    if (isHeading) {
      y += 3;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(108, 92, 231);
    } else if (isSolution) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(80, 150, 80);
    } else {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
    }
    const clean = trimmed.replace(/\*\*/g, '').replace(/^#+\s*/, '');
    const wrapped = doc.splitTextToSize(clean, maxW);
    wrapped.forEach(wl => {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(wl, margin, y);
      y += isHeading ? 7 : 5.5;
    });
  });
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.text(`AMISEARCH • ${i}/${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
    doc.text(new Date().toLocaleDateString('hu-HU'), margin, pageH - 6);
  }
  doc.save('amisearch_feladatok.pdf');
};

window.downloadWord = function() {
  const output = document.getElementById('practiceOutput');
  if (!output || output.innerText.trim() === '' || output.querySelector('.italic')) {
    alert('Először generálj feladatokat!');
    return;
  }
  const rawText = extractTextLines(output.innerHTML);
  const lines = rawText.split('\n').filter(l => l.trim() !== '');
  let rtf = '{\\rtf1\\ansi\\ansicpg1250\\deff0\n';
  rtf += '{\\fonttbl{\\f0\\froman\\fcharset238 Times New Roman;}{\\f1\\fswiss\\fcharset238 Arial;}}\n';
  rtf += '{\\colortbl;\\red108\\green92\\blue231;\\red80\\green150\\blue80;\\red40\\green40\\blue40;}\n';
  rtf += '\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\n';
  rtf += '{\\header\\pard\\qr\\f1\\fs16\\cf3 AMISEARCH – Feladat generátor\\par}\n';
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) { rtf += '\\par\n'; return; }
    const clean = trimmed.replace(/\*\*/g, '').replace(/^#+\s*/, '');
    const escaped = clean
      .replace(/\\/g, '\\\\')
      .replace(/[{}]/g, m => '\\' + m)
      .split('').map(c => {
        const code = c.charCodeAt(0);
        if (code > 127) return `\\u${code}?`;
        return c;
      }).join('');
    const isHeading = /^(#+\s|\*\*|[0-9]+\.\s*(Feladat|Task|Megoldás|Solution))/i.test(trimmed);
    const isSolution = /megoldás|solution/i.test(trimmed);
    if (isHeading) {
      rtf += `\\pard\\sb200\\sa80\\f1\\fs24\\b\\cf1 ${escaped}\\b0\\par\n`;
    } else if (isSolution) {
      rtf += `\\pard\\sb60\\sa60\\f1\\fs20\\i\\cf2 ${escaped}\\i0\\par\n`;
    } else {
      rtf += `\\pard\\sb40\\sa40\\f0\\fs20\\cf3 ${escaped}\\par\n`;
    }
  });
  rtf += '}';
  const blob = new Blob([rtf], { type: 'application/rtf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amisearch_feladatok.rtf';
  a.click();
  URL.revokeObjectURL(url);
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[onclick*="downloadPDF"], [data-action="pdf"]').forEach(btn => {
    btn.onclick = window.downloadPDF;
  });
  document.querySelectorAll('[onclick*="downloadWord"], [data-action="word"]').forEach(btn => {
    btn.onclick = window.downloadWord;
  });
});
