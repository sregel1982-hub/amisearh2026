/**
 * LaTeX és egyszerű tört jelölések átalakítása vizuálisan szép HTML formára
 * Törtek, szimbólumok, halmazjelölések
 */

export function processLatexInline(text) {
  // ✅ 1. RÉGI: egyszerű (szám)/(szám) formátum átalakítása
  text = text.replace(/\((-?\d+(?:\s*[+\-·]\s*\d+)*)\)\s*\/\s*\((-?\d+(?:\s*[+\-·]\s*\d+)*)\)/g,
    `<span class="frac"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></span>`);

  // ✅ 2. Szám/egész egyszerű formátum
  text = text.replace(/(\d+)\/(\d+)/g,
    `<span class="frac"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></span>`);

  // 3. Szabályos LaTeX \frac
  text = text.replace(/\$\\frac\{([^}]+)\}\{([^}]+)\}\$/g,
    `<span class="frac"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></span>`);
  text = text.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g,
    `<span class="frac"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></span>`);

  // Szimbólumok
  text = text
    .replace(/\\infty/g, "∞")
    .replace(/\\in/g, "∈")
    .replace(/\\left\[/g, "[")
    .replace(/\\right\)/g, ")")
    .replace(/\\Rightarrow|\\implies/g, "⇒")
    .replace(/\\ge/g, "≥")
    .replace(/\\le/g, "≤")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "·")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  return text;
}

export function processLatexBlock(line) {
  let math = line
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/^\$\$|\$\$$/g, "");

  // ✅ Itt is az egyszerű formátumok először
  math = math.replace(/\((-?\d+(?:\s*[+\-·]\s*\d+)*)\)\s*\/\s*\((-?\d+(?:\s*[+\-·]\s*\d+)*)\)/g,
    `<div class="frac-display"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></div>`);
  math = math.replace(/(\d+)\/(\d+)/g,
    `<div class="frac-display"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></div>`);

  // Szabályos LaTeX
  math = math.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g,
    `<div class="frac-display"><span class="num">$1</span><span class="bar">─</span><span class="den">$2</span></div>`);

  // Szimbólumok
  math = math
    .replace(/\\infty/g, "∞")
    .replace(/\\in/g, "∈")
    .replace(/\\left\[/g, "[")
    .replace(/\\right\)/g, ")")
    .replace(/\\Rightarrow|\\implies/g, "⇒")
    .replace(/\\ge/g, "≥")
    .replace(/\\le/g, "≤")
    .replace(/\\div/g, "÷")
    .replace(/\\cdot/g, "·");

  return `<div class="math-block">${math}</div>`;
}

export function isLatexBlock(line) {
  return (
    line.startsWith("\\[") ||
    line.startsWith("$$") ||
    line.includes("\\frac") ||
    line.match(/\(\d+\)\s*\/\s*\(\d+\)/) ||  // ✅ felismeri a (5)/(6)-t is
    line.match(/\d+\/\d+/)
  );
}
