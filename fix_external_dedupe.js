// =============================================================================
//  AMISEARCH – fix_external_dedupe.js (JAVÍTOTT, v2)
// -----------------------------------------------------------------------------
//  FŐ VÁLTOZÁS A RÉGI VERZIÓHOZ KÉPEST:
//    A régi:  if (!window.safeMarkdown && window.marked) { … }
//    Az új:   window.safeMarkdown MINDIG definiálva lesz, induláskor.
//             Ha `marked` globális elérhető → marked.parse(text).
//             Ha nem → 4 CDN-ről sorban próbálja betölteni a marked@12.0.2-t.
//             Ha minden CDN blokkolva van → beépített mini-Markdown-parser
//             fut le (képek ![alt](url), linkek [t](u), **félkövér**, *dőlt*,
//             címsorok #/##/###, ---, idézet >, listák, kódblokk).
//             A tartalom MINDIG HTML-escape-elve halad tovább (XSS-biztos).
// =============================================================================

(function () {
  'use strict';

  // ===========================================================================
  // 1) HTML escape – a teljes input ezen megy át először, így a felhasználói
  //    tartalom SOHA nem kerülhet nyersen a HTML-be.
  // ===========================================================================
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===========================================================================
  // 2) Beépített mini-Markdown-parser (fallback), ha minden CDN elbukott.
  //    Támogatott szintaxis:
  //      ![alt](url)            – kép
  //      [text](url)            – link
  //      **szöveg**             – félkövér
  //      *szöveg*               – dőlt
  //      # Cím / ## Cím / ### Cím
  //      ---                    – vízszintes elválasztó
  //      > idézet               – blokkidézet
  //      - elem / * elem        – számozatlan lista
  //      1. elem                – számozott lista
  //      ``` … ```              – kódblokk
  //      `szöveg`               – inline kód
  // ===========================================================================
  function miniRender(raw) {
    if (raw == null) return '';
    const text = String(raw);

    // Kódblokkok elkülönítése (a tartalmuk NEM esik át Markdown-feldolgozáson)
    const codeBlocks = [];
    let s = text.replace(/```([\s\S]*?)```/g, function (_, body) {
      codeBlocks.push(body);
      return '\u0000CB_' + (codeBlocks.length - 1) + '\u0000';
    });

    // Escape – ettől kezdve minden Markdown-szabály biztonságosan futhat
    s = esc(s);

    // Vízszintes elválasztó
    s = s.replace(/^---[ \t]*$/gm, '<hr>');

    // Címsorok (hosszabbtól rövidebb felé!)
    s = s.replace(/^### (.+?)[ \t]*$/gm, '<h3>$1</h3>');
    s = s.replace(/^## (.+?)[ \t]*$/gm, '<h2>$1</h2>');
    s = s.replace(/^# (.+?)[ \t]*$/gm, '<h1>$1</h1>');

    // Idézet: > szöveg
    s = s.replace(/^&gt; (.+?)[ \t]*$/gm, '<blockquote>$1</blockquote>');

    // Képek: ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (_, alt, src) {
      return '<img alt="' + alt + '" src="' + src + '" style="max-width:100%;border-radius:8px;margin:8px 0;">';
    });

    // Linkek: [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });

    // Számozott lista: 1. elem
    s = s.replace(/^(\d+)\. (.+?)[ \t]*$/gm, '<oli>$2</oli>');
    // Számozatlan lista: - elem vagy * elem
    s = s.replace(/^[-*] (.+?)[ \t]*$/gm, '<uli>$1</uli>');

    // Félkövér: ** … ** (HAMARABB, mint a *-os dőlt!)
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');

    // Dőlt: * … * (kikerüljük, ha ** belsejében van)
    s = s.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');

    // Inline kód: ` … `
    s = s.replace(/`([^`\n]+?)`/g, '<code>$1</code>');

    // Lista-csoportosítás
    s = s.replace(/(?:<uli>[^]*?<\/uli>[ \t]*)+/g, function(m){ return '<ul>' + m + '</ul>'; });
    s = s.replace(/(?:<oli>[^]*?<\/oli>[ \t]*)+/g, function(m){ return '<ol>' + m + '</ol>'; });

    // Kódblokkok visszahelyezése (NEM escape-elve, mert kód!)
    codeBlocks.forEach(function (body, i) {
      s = s.split('\u0000CB_' + i + '\u0000').join(
        '<pre style="background:#1F2937;color:#F3F4F6;padding:12px 14px;border-radius:8px;overflow-x:auto;font-family:ui-monospace,monospace;font-size:13px;line-height:1.5;margin:10px 0;"><code>' + body + '</code></pre>'
      );
    });

    // Dupla sortörés → bekezdés, egy → sortörés lágyítása
    s = s.replace(/\n\s*\n/g, '</p><p>');
    s = s.replace(/\n/g, ' ');
    if (!/^<(h\d|ul|ol|pre|hr|blockquote|img|p)/i.test(s.trim())) {
      s = '<p>' + s + '</p>';
    }

    return s;
  }

  // ===========================================================================
  // 3) CDN-lánc – ha a `marked` globális nincs, sorban próbáljuk betölteni
  // ===========================================================================
  const CDN_LIST = [
    'https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js',
    'https://unpkg.com/marked@12.0.2/marked.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js',
    'https://esm.sh/marked@12.0.2?bundle'
  ];

  function tryLoadMarked(idx, done) {
    if (typeof window.marked !== 'undefined' && window.marked.parse) {
      done(true);
      return;
    }
    if (idx >= CDN_LIST.length) { done(false); return; }
    const s = document.createElement('script');
    s.src = CDN_LIST[idx];
    s.async = false;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onload = function () { tryLoadMarked(idx + 1, done); };
    s.onerror = function () {
      console.warn('[AMISEARCH FIX] marked CDN bukott:', CDN_LIST[idx]);
      tryLoadMarked(idx + 1, done);
    };
    document.head.appendChild(s);
  }

  // ===========================================================================
  // 4) safeMarkdown – MINDIG definiálva van induláskor.
  //    A belső `engine` változó frissül, ha a marked később betöltődik.
  // ===========================================================================
  let engine = 'mini'; // indulunk a mini-parserrel

  function safeMarkdown(value) {
    try {
      const text = String(value == null ? '' : value);
      if (engine === 'marked' && typeof window.marked !== 'undefined' && window.marked.parse) {
        let html = window.marked.parse(text);
        // DOMPurify ha elérhető – extra XSS-védelem
        if (window.DOMPurify && window.DOMPurify.sanitize) {
          html = window.DOMPurify.sanitize(html, {
            USE_PROFILES: { html: true },
            FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
            FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover']
          });
        }
        return html;
      }
    } catch (e) {
      // Elesünk a mini-parserhez
    }
    // Mini-parser fut
    try { return miniRender(value); }
    catch (e) { return esc(value).replace(/\n/g, '<br>'); }
  }

  // AZONNAL definiáljuk – a többi script már biztonsággal hívhatja
  window.safeMarkdown = safeMarkdown;
  window.renderMarkdownSafe = safeMarkdown;

  // ===========================================================================
  // 5) marked betöltése a háttérben (nem blokkolja az oldalt)
  // ===========================================================================
  function bootMarked() {
    if (typeof window.marked !== 'undefined' && window.marked.parse) {
      engine = 'marked';
      window.safeMarkdown = safeMarkdown;
      window.renderMarkdownSafe = safeMarkdown;
      return;
    }
    tryLoadMarked(0, function (ok) {
      if (ok && typeof window.marked !== 'undefined' && window.marked.parse) {
        engine = 'marked';
        window.safeMarkdown = safeMarkdown;
        window.renderMarkdownSafe = safeMarkdown;
      } else {
        console.info('[AMISEARCH FIX] marked nem elérhető – beépített mini-parser aktív.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMarked);
  } else {
    bootMarked();
  }

  // ===========================================================================
  // 6) EREDETI runExternalSearch függvény – VÁLTOZATLAN (dedupe logika megmarad)
  // ===========================================================================
  window.runExternalSearch = async function (query, lang, includeForeign, targetEl, page) {
    if (!targetEl) return;
    const pg = page || 1;
    window._externalSearchState = { query, lang, includeForeign, page: pg, target: targetEl };
    try {
      const resp = await fetch('/.netlify/functions/external-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lang, includeForeign: !!includeForeign, page: pg })
      });
      if (!resp.ok) {
        let errMsg = (lang === 'hu' ? 'Külső keresés nem érhető el.' : 'External search unavailable.');
        targetEl.innerHTML = '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-2"></i>' + errMsg + ' [HTTP ' + resp.status + ']</div>';
        return;
      }
      const data = await resp.json();
      let results = (data && data.results) || [];

      // DEDUPE 1: title + source
      const seen = new Map();
      results.forEach(function (r) {
        const key = (r.title || '').toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 100) + '|' + (r.source || '');
        if (!seen.has(key)) seen.set(key, r);
        else {
          const prev = seen.get(key);
          if ((r.abstract || '').length > (prev.abstract || '').length) seen.set(key, r);
        }
      });
      results = Array.from(seen.values());

      // DEDUPE 2: sentences inside abstract – FIXES the screenshot duplication
      results = results.map(function (r) {
        if (!r.abstract) return r;
        const sentences = r.abstract.split(/(?<=[.!?])\s+/);
        const uniq = []; const set = new Set();
        sentences.forEach(function (s) {
          const k = s.trim().slice(0, 80).toLowerCase();
          if (k.length < 10) { uniq.push(s); return; }
          if (!set.has(k)) { set.add(k); uniq.push(s); }
        });
        return Object.assign({}, r, { abstract: uniq.join(' ') });
      });

      if (!results.length) {
        targetEl.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center text-gray-500"><i class="fa-solid fa-globe text-3xl mb-2 text-gray-300"></i><p>' + (lang === 'hu' ? (pg > 1 ? 'Nincs több találat.' : 'Nincs külső találat.') : (pg > 1 ? 'No more results.' : 'No external results.')) + '</p>' + (pg > 1 ? '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg - 1) + ')" class="mt-3 text-xs px-3 py-1.5 bg-gray-100 rounded-lg">← Vissza</button>' : '') + '</div>';
        return;
      }

      let html = '<div class="text-sm text-gray-500 mb-2 flex items-center justify-between"><span><i class="fa-solid fa-globe mr-1"></i>' + (lang === 'hu' ? 'Külső akadémiai találatok' : 'External academic results') + ' (' + results.length + ')</span><span class="text-xs">' + (lang === 'hu' ? 'Oldal' : 'Page') + ' ' + pg + '</span></div><div class="space-y-3">';
      for (const r of results) {
        const safeTitle = r.title || '';
        const safeAbstract = r.abstract ? (window.safeMarkdown ? window.safeMarkdown(r.abstract) : esc(r.abstract)) : '';
        html += '<div class="bg-white rounded-2xl p-4 shadow border border-gray-100"><div class="flex items-start gap-2 mb-1 flex-wrap"><span class="px-2 py-0.5 text-xs bg-purple-100 text-[#6C5CE7] rounded-full">' + esc(r.source || '') + '</span>' + (r.year ? '<span class="text-xs text-gray-500">' + r.year + '</span>' : '') + '</div><h4 class="font-semibold text-gray-900">' + esc(safeTitle) + '</h4>' + (r.authors ? '<p class="text-xs text-gray-500 mt-1">' + esc(r.authors) + '</p>' : '') + '<div class="text-sm text-gray-600 mt-2 prose prose-sm max-w-none">' + safeAbstract + '</div><div class="mt-3 flex gap-2 flex-wrap">' + (r.pdfUrl ? '<a href="' + esc(r.pdfUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"><i class="fa-solid fa-file-pdf"></i>PDF</a>' : '') + (r.sourceUrl ? '<a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"><i class="fa-solid fa-arrow-up-right-from-square"></i> Megnyitás</a>' : '') + '</div></div>';
      }
      html += '</div><div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">';
      if (pg > 1) html += '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg - 1) + ')" class="text-sm px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"><i class="fa-solid fa-arrow-left"></i> Előző</button>'; else html += '<div></div>';
      html += '<span class="text-xs text-gray-500">Oldal ' + pg + '</span>';
      if (results.length >= 10) html += '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg + 1) + ')" class="text-sm px-4 py-2 bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-lg">Következő <i class="fa-solid fa-arrow-right"></i></button>'; else html += '<div></div>';
      html += '</div>';
      targetEl.innerHTML = html;
    } catch (e) {
      console.error('External search error:', e);
      targetEl.innerHTML = '<div class="text-gray-400 text-sm">Külső keresés hiba: ' + (e && e.message ? e.message : e) + '</div>';
    }
  };

  console.log('[AMISEARCH FIX v2] safeMarkdown mindig elérhető; mini-parser aktív induláskor, marked CDN-lánc betöltés a háttérben.');
})();
