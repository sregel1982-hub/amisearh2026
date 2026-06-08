// ==================== export_fix.js ====================

function latexToUnicode(text) {
 if (!text || typeof text !== 'string') return '';

 return text
 // === ERŐS TISZTÍTÁS (LaTeX maradékok) ===
 .replace(/\\quad_?/g, ' ')
 .replace(/\\qquad/g, ' ')
 .replace(/\\_/g, ' ')
 .replace(/\\hspace\{[^}]+\}/g, ' ')
 .replace(/\\par/g, '\n\n')
 .replace(/\\[a-zA-Z]+\{[^}]*\}/g, ' ') // pl. \frac{1}{2}
 .replace(/\\[a-zA-Z]+/g, ' ') // minden maradék LaTeX parancs

 // Tört számok javítása
 .replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, '$1 $2/$3')
 .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')
 .replace(/1\\frac\{(\d+)\}\{(\d+)\}/g, '1 $1/$2')
 .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')

 // Matematikai szimbólumok
 .replace(/\\times/g, '×')
 .replace(/\\div/g, '÷')
 .replace(/\\pm/g, '±')
 .replace(/\\leq/g, '≤')
 .replace(/\\geq/g, '≥')
 .replace(/\\neq/g, '≠')
 .replace(/\\approx/g, '≈')
 .replace(/\\cdot/g, '·')

 // KaTeX maradékok eltávolítása
 .replace(/\$\$\( ([^ \)]+)\$\$/g, '$1')
 .replace(/\\\( ([^ \)]+)\$/g, '$1')
 .replace(/[{}\[\]]/g, '')
 .replace(/\\\\\[/g, '').replace(/\\\\\]/g, '')
 .replace(/\\\\\(/g, '').replace(/\\\\\)/g, '')

 // Többszörös szóközök és sorvégek tisztítása
 .replace(/\s+/g, ' ')
 .trim();
}

function toSuperscript(str) {
 const m = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','n':'ⁿ'};
 return str.split('').map(c => m[c] || c).join('');
}

function toSubscript(str) {
 const m = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉'};
 return str.split('').map(c => m[c] || c).join('');
}

// ==================== PDF export (html2canvas + jsPDF) ====================

// === JAVÍTÁS: Több oldalas PDF színes fejléccel ===
async function elementToPdf(el, filename, title = 'AmiSearch') {
 const { jsPDF } = window.jspdf || {};
 if (!jsPDF) { alert('jsPDF nem elérhető.'); return; }
 if (typeof html2canvas === 'undefined') { alert('html2canvas nem elérhető.'); return; }

 // JAVÍTÁS: "Rendben, adok..." szöveg eltávolítása
 const clone = el.cloneNode(true);
 const paragraphs = clone.querySelectorAll('p, div');
 paragraphs.forEach(p => {
  const text = p.textContent || '';
  if (text.toLowerCase().includes('rendben') && 
      (text.toLowerCase().includes('adok') || text.toLowerCase().includes('feladatot'))) {
   p.remove();
  }
 });

 const canvas = await html2canvas(clone, {
  scale: 2,
  useCORS: true,
  backgroundColor: '#ffffff',
  logging: false
 });

 const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
 const pageW = doc.internal.pageSize.getWidth();
 const pageH = doc.internal.pageSize.getHeight();
 const margin = 10;
 const contentW = pageW - margin * 2;
 const headerH = 20; // Fejléc magassága

 // === JAVÍTÁS: Színes fejléc ===
 doc.setFillColor(108, 92, 231); // #6C5CE7 lila
 doc.rect(0, 0, pageW, headerH, 'F');
 
 // Fejléc szöveg
 doc.setTextColor(255, 255, 255); // Fehér szöveg
 doc.setFont('helvetica', 'bold');
 doc.setFontSize(16);
 doc.text('AmiSearch', margin + 5, 13);
 
 doc.setFont('helvetica', 'normal');
 doc.setFontSize(10);
 doc.text('AI Tutor - Feladatgenerátor', margin + 5, 18);

 // Dátum
 const date = new Date().toLocaleDateString('hu-HU');
 doc.setFontSize(8);
 doc.text(date, pageW - margin - 30, 13);

 // === JAVÍTÁS: Több oldalas kép ===
 const imgData = canvas.toDataURL('image/png');
 const imgW = contentW;
 const imgH = (canvas.height / canvas.width) * imgW;
 
 // Ha a kép magasabb, mint az oldal, több oldalra bontjuk
 const availableH = pageH - headerH - margin - 10; // Maradék hely a fejléc után
 let position = 0;
 let pageNum = 1;

 while (position < imgH) {
  // Új oldal (az elsőn már van fejléc)
  if (pageNum > 1) {
   doc.addPage();
   // Minden oldalon színes fejléc
   doc.setFillColor(108, 92, 231);
   doc.rect(0, 0, pageW, 12, 'F');
   doc.setTextColor(255, 255, 255);
   doc.setFont('helvetica', 'bold');
   doc.setFontSize(10);
   doc.text('AmiSearch', margin + 5, 8);
   doc.setFontSize(8);
   doc.text('- ' + pageNum + '. oldal', pageW - margin - 25, 8);
  }

  // Kép részlet hozzáadása
  const sourceY = (position / imgH) * canvas.height;
  const sourceH = Math.min((availableH / imgH) * canvas.height, canvas.height - sourceY);
  const destH = (sourceH / canvas.height) * imgH;

  if (destH > 0) {
   doc.addImage(
    imgData, 'PNG',
    margin, pageNum === 1 ? headerH + 5 : 15, // y pozíció
    imgW, destH,
    undefined, 'FAST',
    0,
    sourceY / canvas.height // sourceY
   );
  }

  position += availableH;
  pageNum++;
 }

 doc.save((filename || 'amisearch') + '.pdf');
}

// ==================== Word / RTF export ====================

function extractTextLines(el) {
 const clone = el.cloneNode(true);
 
 // JAVÍTÁS: "Rendben, adok..." szöveg eltávolítása
 const paragraphs = clone.querySelectorAll('p, div');
 paragraphs.forEach(p => {
  const text = p.textContent || '';
  if (text.toLowerCase().includes('rendben') && 
      (text.toLowerCase().includes('adok') || text.toLowerCase().includes('feladatot'))) {
   p.remove();
  }
 });
 
 clone.querySelectorAll('.katex').forEach(k => {
  const latex = k.querySelector('annotation')?.textContent || k.textContent || '';
  k.replaceWith(document.createTextNode(latexToUnicode(latex)));
 });
 return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ');
}

function buildRtf(title, text) {
 let rtf = '{\\rtf1\\ansi\\ansicpg1250\\deff0\n';
 rtf += '{\\fonttbl{\\f0\\froman Times New Roman;}{\\f1\\fswiss Arial;}}\n';
 rtf += '\\paperw11906\\paperh16838\\margl1440\\margr1440\\margt1440\\margb1440\n';
 rtf += '\\pard\\sb200\\sa100\\f1\\fs28\\b ' + title + '\\b0\\par\n';
 rtf += text.split('\n').map(line => '\\pard\\sa80 ' + line + '\\par\n').join('');
 rtf += '}';
 return rtf;
}

// ==================== Export funkciók ====================

window.downloadAiAnswerPdf = async function(btn) {
 const bubble = btn.closest('.ai-bubble, .bg-white, .message');
 if (!bubble) return;
 const q = btn.getAttribute('data-q') || 'valasz';
 await elementToPdf(bubble, q);
};

window.downloadAiAnswerWord = function(btn) {
 const bubble = btn.closest('.ai-bubble, .bg-white, .message');
 if (!bubble) return;
 const q = btn.getAttribute('data-q') || 'valasz';
 const text = extractTextLines(bubble);
 const rtf = buildRtf('AmiSearch AI Válasz', text);
 const blob = new Blob([rtf], { type: 'application/rtf' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = q + '.rtf';
 a.click();
 URL.revokeObjectURL(url);
};

console.log('✅ export_fix.js loaded with improved LaTeX cleanup and multi-page PDF');
    
