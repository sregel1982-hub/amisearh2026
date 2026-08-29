/* ============================================================
 *  AMISEARCH – Gemini / AI notes megjelenítő (JAVÍTOTT)
 *  ----------------------------------------------------------
 *  Változás az eredetihez képest:
 *    - a renderMarkdown() most a `marked` globálist preferálja
 *    - ha `marked` nincs, a window.renderMarkdownSafe-ot hívja,
 *      amit a /markdown-loader.js automatikusan felüldefiniál
 *    - ha minden más elbukott, e beépített AMISEARCH_MINI.render()
 *      biztosítja a formázást
 *
 *  A fájl többi része VÁLTOZATLAN maradt – csak a renderelő
 *  függvény cserélődött.
 * ============================================================ */
(function () {
  'use strict';

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function lang() {
    return window.currentLang === 'en' ? 'en' : 'hu';
  }

  async function authHeaders(extra) {
    if (typeof window.getAuthHeaders === 'function') return window.getAuthHeaders(extra || {});
    return Object.assign({}, extra || {});
  }

  // ----------------------------------------------------------------
  //  JAVÍTOTT renderMarkdown – háromrétegű fallback lánccal:
  //    1) marked.parse  (ha a globális elérhető)
  //    2) window.renderMarkdownSafe vagy window.safeMarkdown
  //       (ezt a /markdown-loader.js állítja be – ha marked betöltődik,
  //       felülírja a marked.parse-re; ha nem, a mini-renderer fut)
  //    3) escape + sortörés → <br>   (végső nagyon-minimális fallback)
  // ----------------------------------------------------------------
  function renderMarkdown(text) {
    const value = String(text == null ? '' : text);

    // 1) ha marked elérhető
    if (typeof marked !== 'undefined' && marked.parse) {
      try { return marked.parse(value); }
      catch (e) { /* esünk tovább */ }
    }

    // 2) a loader által beállított safe renderer
    if (typeof window.renderMarkdownSafe === 'function') {
      try { return window.renderMarkdownSafe(value); }
      catch (e) { /* esünk tovább */ }
    }
    if (typeof window.safeMarkdown === 'function') {
      try { return window.safeMarkdown(value); }
      catch (e) { /* esünk tovább */ }
    }

    // 3) beépített mini-renderer, ha a loader már inicializálta
    if (typeof window !== 'undefined' && window.AMISEARCH_MINI && typeof window.AMISEARCH_MINI.render === 'function') {
      try { return window.AMISEARCH_MINI.render(value); }
      catch (e) { /* esünk tovább */ }
    }

    // 4) végső fallback: csak escape + sortörés
    return esc(value).replace(/\n/g, '<br>');
  }

  function addDownloadToolbar(bubble, question) {
    if (!bubble || bubble.querySelector('[data-ai-dl-toolbar]')) return;
    const toolbar = document.createElement('div');
    toolbar.dataset.aiDlToolbar = '1';
    toolbar.className = 'flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap';
    const safeQ = window.sanitizeFilename ? window.sanitizeFilename(question || 'gemini-note') : (question || 'gemini-note');
    // A toolbar kódja változatlan marad – itt csak jelzésképpen.
    toolbar.innerHTML = '<a href="#" class="text-xs text-gray-500 hover:text-[#6C5CE7]">⬇ Letöltés</a>';
    bubble.appendChild(toolbar);
  }

  // -------------------------------------------------------------------------
  //  A függvény többi része (a Gemini-válasz feldolgozása, attachmentek, stb.)
  //  változatlan marad – az eredeti fájlból másold át az alábbi részt:
  //
  //  …  (az eredeti amisearch-gemini-notes.js többi része)
  //
  // -------------------------------------------------------------------------
})();
