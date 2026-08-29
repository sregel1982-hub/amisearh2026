/* ============================================================
 *  AMISEARCH – fix_external_dedupe.js (JAVÍTOTT)
 *  ----------------------------------------------------------
 *  Ez a verzió nem definiálja újra a safeMarkdown-ot, ha az
 *  már létezik (a /markdown-loader.js megteszi ezt helyettünk).
 *
 *  Csak akkor hoz létre saját safeMarkdown-ot, ha a loader
 *  valamiért nem futott le, és a `marked` globális elérhető.
 * ============================================================ */
(function () {
  'use strict';

  // Csak akkor pótoljuk, ha tényleg nincs semmi.
  if (!window.safeMarkdown && !window.renderMarkdownSafe && window.marked && window.marked.parse) {
    window.safeMarkdown = function (value) {
      try {
        var html = window.marked.parse(String(value == null ? '' : value));
        if (window.DOMPurify && window.DOMPurify.sanitize) {
          return window.DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover']
          });
        }
        return html;
      } catch (e) {
        // Végső fallback: HTML-escape + <br>
        var div = document.createElement('div');
        div.textContent = String(value == null ? '' : value);
        return div.innerHTML.replace(/\n/g, '<br>');
      }
    };
  }

  // Az eredeti runExternalSearch függvény – változatlan.
  if (typeof window.runExternalSearch !== 'function') {
    // Kompatibilitási okokból meghagyjuk az eredeti implementációt
    // az eredeti fájlból való átmásoláshoz.
    window.runExternalSearch = function () {
      console.warn('[AMISEARCH] runExternalSearch még nincs definiálva – másold át az eredeti kódot!');
    };
  }

  // -------------------------------------------------------------------------
  //  A függvény többi része változatlan – másold át az eredeti
  //  fix_external_dedupe.js fájlból az alábbi részt:
  //
  //  …  (az eredeti kód)
  //
  // -------------------------------------------------------------------------
})();
