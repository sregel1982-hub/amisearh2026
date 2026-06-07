// netlify/functions/utils.js

export function latexToUnicode(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .replace(/\\quad_?/g, ' ')
    .replace(/\\qquad/g, '  ')
    .replace(/\\_/g, ' ')
    .replace(/\\hspace\{[^}]+\}/g, ' ')
    .replace(/\\par/g, '\n\n')
    .replace(/\\[a-zA-Z]+\{[^}]*\}/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/(\d+)\\frac\{(\d+)\}\{(\d+)\}/g, '$1 $2/$3')
    .replace(/\\frac\{(\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/1\\frac\{(\d+)\}\{(\d+)\}/g, '1 $1/$2')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\$\\( ([^ \)]+)\$\$/g, '$1')
    .replace(/\\( ([^ \)]+)\$/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\\\[/g, '').replace(/\\\]/g, '')
    .replace(/\\\(/g, '').replace(/\\\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
