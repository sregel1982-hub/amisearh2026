   function latexToUnicode(text) {
  if (!text) return '';

  return text
    // === ERŐS TISZTÍTÁS ===
    .replace(/\\quad_?/g, ' ')
    .replace(/\\qquad/g, '  ')
    .replace(/\\_/g, ' ')
    .replace(/\\hspace\{[^}]+\}/g, ' ')
    .replace(/\\par/g, '\n\n')
    .replace(/\\[a-zA-Z]+\{[^}]+\}/g, ' ')   // pl. \frac{...}
    .replace(/\\[a-zA-Z]+/g, ' ')            // minden maradék LaTeX parancs

    // Tört számok javítása
    .replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, '$1 $2/$3')
    .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/1\\frac\{(\d+)\}\{(\d+)\}/g, '1 $1/$2')

    // Matematikai szimbólumok
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')

    // KaTeX maradékok
    .replace(/\$\\( ([^ \)]+)\$\$/g, '$1')
    .replace(/\\( ([^ \)]+)\$/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\\\[/g, '').replace(/\\\]/g, '')
    .replace(/\\\(/g, '').replace(/\\\)/g, '')

    // Többszörös szóközök eltávolítása
    .replace(/\s+/g, ' ')
    .trim();
   }
