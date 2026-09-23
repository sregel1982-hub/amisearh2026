// AMISEARCH PDF export – teljes, önálló javítás
// Az index.html már ezt a fájlt tölti be: /pdf-export-fixed.js
// Az index.html módosítása nem szükséges.

(function () {
  'use strict';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFC')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function cleanHeading(value) {
    return String(value || '')
      .replace(/^#{1,6}\s*/, '')
      .replace(/^\*\*|\*\*$/g, '')
      .replace(/^\d+[.)]\s*/, function (match) {
        return match.trim() + ' ';
      })
      .replace(/\s*:\s*$/, '')
      .trim();
  }

  function headingType(value) {
    const clean = cleanHeading(value);

    if (/^(?:\d+[.)]?\s*)?(feladat|feladatlap)\b/i.test(clean)) {
      return 'task';
    }

    if (/^(?:\d+[.)]?\s*)?(megoldás|megoldókulcs|megoldas)\b/i.test(clean)) {
      return 'solution';
    }

    if (/^(?:ellenőrzés|ellenorzes|összefoglalás|osszefoglalas|eredmény|eredmeny|bizonyítás|bizonyitas|definíció|definicio|tétel|tetel|tulajdonságok)\b/i.test(clean)) {
      return 'general';
    }

    return '';
  }

  function isHeading(line) {
    const value = String(line || '').trim();

    if (!value) return false;

    if (/^#{1,6}\s+/.test(value)) {
      return true;
    }

    if (/^(?:\d+[.)]?\s*)?(feladat|feladatlap|megoldás|megoldókulcs|megoldas|ellenőrzés|ellenorzes|összefoglalás|osszefoglalas|eredmény|eredmeny|bizonyítás|bizonyitas|definíció|definicio|tétel|tetel|tulajdonságok)\b\s*:?(?:\s*)$/i.test(value)) {
      return true;
    }

    if (/^\d+[.)]\s+(?:feladat|megoldás|megoldas)\b/i.test(value)) {
      return true;
    }

    return false;
  }

  function isStepHeading(line) {
    const value = String(line || '').trim();

    return /^(?:\d+[.)]\s+)?(?:lépés|lepes)\b/i.test(value) &&
      value.length < 100;
  }

  function isListLine(line) {
    return /^\s*(?:[-*•]|\d+[.)])\s+/.test(String(line || ''));
  }

  function renderInline(value) {
    let text = String(value || '');
    const imageTokens = [];
    const mathTokens = [];

    text = text.replace(
      /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi,
      function (_, alt, url) {
        const token = '@@IMAGE_' + imageTokens.length + '@@';

        imageTokens.push(
          '<figure class="inline-figure">' +
          '<img src="' + escapeAttr(url) + '" alt="' + escapeAttr(alt) + '">' +
          '<figcaption>' + escapeHtml(alt) + '</figcaption>' +
          '</figure>'
        );

        return token;
      }
    );

    text = text.replace(
      /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+\$)/g,
      function (formula) {
        const display =
          formula.indexOf('$$') === 0 ||
          formula.indexOf('\\[') === 0;

        const raw = formula
          .replace(/^\$\$|\$\$$/g, '')
          .replace(/^\\\[|\\\]$/g, '')
          .replace(/^\\\(|\\\)$/g, '')
          .replace(/^\$|\$$/g, '')
          .trim();

        const token = '@@MATH_' + mathTokens.length;

        mathTokens.push({
          token: token,
          formula: raw,
          display: display
        });

        return token;
      }
    );

    let result = escapeHtml(text)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    mathTokens.forEach(function (item) {
      result = result.replace(
        item.token,
        '<span class="math-placeholder ' +
          (item.display ? 'math-display' : 'math-inline') +
          '" data-formula="' +
          encodeURIComponent(item.formula) +
          '"></span>'
      );
    });

    imageTokens.forEach(function (html, index) {
      result = result.replace(
        '@@IMAGE_' + index + '@@',
        html
      );
    });

    return result;
  }

  function toBeautifulHtml(rawValue) {
    const text = normalizeText(rawValue);

    if (!text) return '';

    const lines = text.split('\n').map(function (line) {
      return line.trim();
    });

    let html = '';
    let paragraph = [];
    let listItems = [];

    function flushParagraph() {
      if (!paragraph.length) return;

      const content = paragraph.join(' ').trim();

      if (content) {
        html += '<p>' + renderInline(content) + '</p>';
      }

      paragraph = [];
    }

    function flushList() {
      if (!listItems.length) return;

      html +=
        '<ul class="answer-list">' +
        listItems.map(function (item) {
          return '<li>' + renderInline(item) + '</li>';
        }).join('') +
        '</ul>';

      listItems = [];
    }

    lines.forEach(function (line) {
      if (!line) {
        flushParagraph();
        flushList();
        return;
      }

      if (isHeading(line)) {
        flushParagraph();
        flushList();

        const type = headingType(line);

        let className = 'section-heading';

        if (type === 'task') {
          className = 'task-heading';
        } else if (type === 'solution') {
          className = 'solution-heading';
        }

        html +=
          '<h2 class="' +
          className +
          '">' +
          renderInline(cleanHeading(line)) +
          '</h2>';

        return;
      }

      if (isStepHeading(line)) {
        flushParagraph();
        flushList();

        html +=
          '<h3 class="step-heading">' +
          renderInline(cleanHeading(line)) +
          '</h3>';

        return;
      }

      if (isListLine(line)) {
        flushParagraph();

        listItems.push(
          line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '')
        );

        return;
      }

      paragraph.push(line);

      if (paragraph.join(' ').length > 650) {
        flushParagraph();
      }
    });

    flushParagraph();
    flushList();

    return html;
  }

  const STYLE = `
    @page {
      size: A4;
      margin: 16mm 17mm 18mm;
    }

    :root {
      --blue: #2563eb;
      --blue-dark: #1e3a8a;
      --blue-light: #dbeafe;
      --green: #059669;
      --green-dark: #047857;
      --gray: #475569;
      --line: #e2e8f0;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
    }

    body {
      color: #1e293b;
      font-family: Inter, "Segoe UI", Arial, sans-serif;
      font-size: 10.8pt;
      line-height: 1.55;
      width: calc(100% - 36px);
      max-width: 820px;
      margin: 0 auto;
      padding: 0 18px 28px;
      overflow-wrap: anywhere;
    }

    .top {
      color: #ffffff;
      background: linear-gradient(
        135deg,
        #2563eb 0%,
        #1d4ed8 58%,
        #1e3a8a 100%
      );
      border-radius: 12px;
      padding: 17px 21px;
      margin-bottom: 13px;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .top h1 {
      margin: 0;
      font-size: 19pt;
      line-height: 1.15;
      letter-spacing: 0.2px;
    }

    .top small {
      display: block;
      margin-top: 5px;
      font-size: 9pt;
      opacity: 0.94;
    }

    .meta {
      color: #64748b;
      font-size: 8pt;
      margin: 0 2px 14px;
    }

    p {
      margin: 0 0 9px;
      text-align: left;
      orphans: 3;
      widows: 3;
    }

    .section-heading,
    .task-heading,
    .solution-heading {
      font-size: 13pt;
      line-height: 1.2;
      font-weight: 700;
      margin: 18px 0 9px;
      padding: 8px 12px;
      border-radius: 7px;
      page-break-after: avoid;
      break-after: avoid;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    .section-heading {
      color: var(--blue-dark);
      background: linear-gradient(
        90deg,
        var(--blue-light),
        transparent
      );
      border-left: 4px solid var(--blue);
      border-bottom: 1px solid #bfdbfe;
    }

    .task-heading {
      color: #ffffff;
      background: linear-gradient(
        90deg,
        #2563eb,
        #1d4ed8
      );
      border-left: 4px solid #1e3a8a;
    }

    .solution-heading {
      color: #ffffff;
      background: linear-gradient(
        90deg,
        #059669,
        #047857
      );
      border-left: 4px solid #065f46;
    }

    .step-heading {
      color: #3730a3;
      font-size: 11.5pt;
      margin: 13px 0 6px;
      padding-bottom: 3px;
      border-bottom: 2px solid #c7d2fe;
      page-break-after: avoid;
      break-after: avoid;
    }

    .answer-list {
      margin: 7px 0 11px;
      padding: 0;
      list-style: none;
    }

    .answer-list li {
      margin: 5px 0;
      padding: 7px 10px 7px 27px;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-left: 3px solid var(--green);
      border-radius: 6px;
      position: relative;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .answer-list li::before {
      content: "•";
      position: absolute;
      left: 11px;
      color: var(--green);
      font-weight: 700;
    }

    .inline-figure {
      margin: 12px auto;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .inline-figure img {
      max-width: 100%;
      max-height: 125mm;
      border-radius: 7px;
      border: 1px solid var(--line);
    }

    .inline-figure figcaption {
      color: var(--gray);
      font-size: 8pt;
      margin-top: 3px;
    }

    .math-placeholder {
      display: inline-block;
      min-width: 4px;
    }

    .math-display {
      display: block;
      text-align: center;
      margin: 9px 0;
      padding: 8px;
      background: #f8fafc;
      border: 1px solid var(--line);
      border-radius: 7px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    code {
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 3px;
      font-family: Consolas, monospace;
    }

    .footer {
      color: #94a3b8;
      font-size: 7.5pt;
      text-align: center;
      margin-top: 25px;
      padding-top: 8px;
      border-top: 1px solid var(--line);
    }

    @media print {
      body {
        width: auto;
        max-width: none;
        padding: 0;
      }

      .top,
      .task-heading,
      .solution-heading,
      .section-heading {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }

      h1,
      h2,
      h3 {
        page-break-after: avoid;
        break-after: avoid;
      }
    }
  `;

  function openStyledPrintWindow(title, contentHtml) {
    const win = window.open('', '_blank');

    if (!win) {
      alert(
        'A böngésző letiltotta a felugró ablakot. ' +
        'Engedélyezd a PDF-exportot ehhez az oldalhoz.'
      );
      return;
    }

    win.document.write(
      '<!doctype html>' +
      '<html lang="hu">' +
      '<head>' +
      '<meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">' +
      '<style>' + STYLE + '</style>' +
      '<script src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"><\/script>' +
      '</head>' +
      '<body>' +
      '<header class="top">' +
      '<h1>AMISEARCH</h1>' +
      '<small>Feladatok, megoldások és magyarázatok</small>' +
      '</header>' +
      '<div class="meta">' +
      escapeHtml(title) +
      ' · ' +
      escapeHtml(new Date().toLocaleString('hu-HU')) +
      '</div>' +
      '<main>' +
      contentHtml +
      '</main>' +
      '<footer class="footer">amisearch.org</footer>' +
      '<script>' +
      '(function(){' +
      'function r(){' +
      'if(!window.katex){setTimeout(r,100);return;}' +
      'document.querySelectorAll(".math-placeholder").forEach(function(n){' +
      'try{' +
      'window.katex.render(' +
      'decodeURIComponent(n.dataset.formula||""),' +
      'n,' +
      '{displayMode:n.classList.contains("math-display"),' +
      'throwOnError:false,' +
      'strict:false}' +
      ');' +
      '}catch(e){' +
      'n.textContent=decodeURIComponent(n.dataset.formula||"");' +
      '}' +
      '});' +
      'setTimeout(function(){window.focus();window.print();},350);' +
      '}' +
      'r();' +
      '})();' +
      '<\/script>' +
      '</body>' +
      '</html>'
    );

    win.document.close();
  }

  function readElementText(selector) {
    const element = document.querySelector(selector);

    return element
      ? (element.innerText || element.textContent || '').trim()
      : '';
  }

  function renderedElementHtml(selector) {
    const element = document.querySelector(selector);

    if (!element) return '';

    const clone = element.cloneNode(true);

    clone
      .querySelectorAll(
        '[data-ai-dl-toolbar], #practiceToolbar, #examToolbar'
      )
      .forEach(function (node) {
        node.remove();
      });

    const walker = document.createTreeWalker(
      clone,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (node) {
          if (!node.nodeValue || !node.nodeValue.trim()) {
            return NodeFilter.FILTER_REJECT;
          }

          if (
            node.parentElement &&
            node.parentElement.closest('script,style,.katex')
          ) {
            return NodeFilter.FILTER_REJECT;
          }

          return /\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]/.test(
            node.nodeValue
          )
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT;
        }
      }
    );

    const mathTextNodes = [];

    while (walker.nextNode()) {
      mathTextNodes.push(walker.currentNode);
    }

    mathTextNodes.forEach(function (node) {
      const match = node.nodeValue.match(
        /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/
      );

      if (!match) return;

      const formula = match[1]
        .replace(/^\$\$|\$\$$/g, '')
        .replace(/^\\\[|\\\]$/g, '')
        .trim();

      const placeholder = clone.ownerDocument.createElement('span');

      placeholder.className = 'math-placeholder math-display';

      placeholder.setAttribute(
        'data-formula',
        encodeURIComponent(formula)
      );

      const fragment =
        clone.ownerDocument.createDocumentFragment();

      if (match.index > 0) {
        fragment.appendChild(
          clone.ownerDocument.createTextNode(
            node.nodeValue.slice(0, match.index)
          )
        );
      }

      fragment.appendChild(placeholder);

      const after = node.nodeValue.slice(
        match.index + match[1].length
      );

      if (after) {
        fragment.appendChild(
          clone.ownerDocument.createTextNode(after)
        );
      }

      node.parentNode.replaceChild(fragment, node);
    });

    clone
      .querySelectorAll('h1, h2, h3, h4, h5, h6')
      .forEach(function (heading) {
        const type = headingType(heading.textContent || '');

        heading.classList.remove(
          'section-heading',
          'task-heading',
          'solution-heading',
          'step-heading'
        );

        if (type === 'task') {
          heading.classList.add('task-heading');
        } else if (type === 'solution') {
          heading.classList.add('solution-heading');
        } else if (type === 'general') {
          heading.classList.add('section-heading');
        } else if (isStepHeading(heading.textContent || '')) {
          heading.classList.add('step-heading');
        } else {
          heading.classList.add('section-heading');
        }
      });

    return clone.innerHTML.trim();
  }

  window.downloadAiAnswerPdf = function (button) {
    const bubble =
      button &&
      (
        button.closest('.bg-white') ||
        button.closest('.ai-output')
      );

    if (!bubble) return;

    const clone = bubble.cloneNode(true);

    clone.querySelector('[data-ai-dl-toolbar]')?.remove();

    const html = clone.innerHTML.trim();

    if (html) {
      openStyledPrintWindow(
        'AI válasz',
        html
      );
    }
  };

  window.downloadPracticePdf = function (topicName) {
    const html = renderedElementHtml('#practiceContent');

    if (html) {
      openStyledPrintWindow(
        (topicName || 'Feladatok').replace(/_/g, ' ') +
        ' — Feladatok',
        html
      );
    }
  };

  window.downloadExamPdf = function (topicName) {
    const html = renderedElementHtml('#examContent');

    if (html) {
      openStyledPrintWindow(
        (topicName || 'Vizsgafeladatsor').replace(/_/g, ' ') +
        ' — Vizsgafeladatsor',
        html
      );
    }
  };

  console.log(
    '[AMISEARCH] pdf-export-fixed.js aktív – ' +
    'kék feladat / zöld megoldás PDF blokkok.'
  );
})();
