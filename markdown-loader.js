/* ============================================================
 *  AMISEARCH – `marked` könyvtár önmagát betöltő loader
 *  ----------------------------------------------------------
 *  Három CDN-t próbál sorban. Ha az első blokkolva van,
 *  a következő CDN-ről tölti be. Ha mindhárom elbukik,
 *  a window.safeMarkdown / window.renderMarkdownSafe függvények
 *  továbbra is működnek, csak a beépített AMISEARCH_MINI.render()
 *  mini-renderert használják.
 *
 *  Használat a HTML <head>-ben:
 *    <script src="/markdown-loader.js" defer></script>
 *
 *  A loader a window.safeMarkdown függvényt MINDIG felülírja azzal
 *  a verzióval, amelyik futni tud (marked → marked.try → mini-renderer).
 * ============================================================ */
(function () {
  'use strict';
  if (typeof window === 'undefined') return;

  // Ha már van marked globálisan (manuálisan töltve), nem csinálunk semmit.
  if (typeof window.marked !== 'undefined') {
    window.dispatchEvent(new Event('amisearch-marked-ready'));
    return;
  }

  // CDN-lánc – sorrendben próbáljuk.
  var CDN_LIST = [
    'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
    'https://unpkg.com/marked@12.0.2/marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js',
    'https://esm.sh/marked@12.0.2?bundle'
  ];

  var FALLBACK_RENDERER =
    (typeof window.AMISEARCH_MINI !== 'undefined' && window.AMISEARCH_MINI.render)
      ? window.AMISEARCH_MINI.render
      : function (text) {
          // Végső végső fallback: HTML-escape + sortörés → <br>
          var div = document.createElement('div');
          div.textContent = String(text == null ? '' : text);
          return div.innerHTML.replace(/\n/g, '<br>');
        };

  function dispatchReady() {
    try {
      window.dispatchEvent(new Event('amisearch-marked-ready'));
    } catch (e) { /* régebbi böngészők */ }
  }

  function tryNext(index) {
    if (typeof window.marked !== 'undefined') {
      // Sikerült – felülírjuk a safeMarkdown-ot, hogy a marked.parse-t használja.
      window.safeMarkdown = window.renderMarkdownSafe = function (text) {
        try { return window.marked.parse(String(text || '')); }
        catch (e) { return FALLBACK_RENDERER(text); }
      };
      dispatchReady();
      return;
    }
    if (index >= CDN_LIST.length) {
      // Minden CDN elbukott – a mini-renderer marad.
      console.warn('[AMISEARCH] marked CDN-ek nem elérhetők, mini-renderer aktív.');
      window.safeMarkdown = window.renderMarkdownSafe = FALLBACK_RENDERER;
      dispatchReady();
      return;
    }
    var s = document.createElement('script');
    s.src = CDN_LIST[index];
    s.async = false;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onload = function () { tryNext(index + 1); };
    s.onerror = function () {
      console.warn('[AMISEARCH] marked CDN bukott:', CDN_LIST[index]);
      tryNext(index + 1);
    };
    document.head.appendChild(s);
  }

  // Azonnal felajánljuk a safeMarkdown-ot, hogy más scriptek azonnal
  // hívhassák – miközben a loader még a CDN-eket próbálja.
  window.safeMarkdown = window.renderMarkdownSafe = FALLBACK_RENDERER;

  // DOMContentLoaded után indítjuk, hogy ne blokkolja az oldalt.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { tryNext(0); });
  } else {
    tryNext(0);
  }
})();
