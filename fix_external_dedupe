// FIX for AMISEARCH - external search duplication bug
// Include this file AFTER your main scripts: <script src="/fix-external-dedupe.js"></script>

(function() {
  // Ensure safeMarkdown exists
  if (!window.safeMarkdown && window.marked) {
    window.safeMarkdown = function(value) {
      var source = String(value == null ? '' : value);
      var html = marked.parse(source);
      if (window.DOMPurify) {
        return DOMPurify.sanitize(html, {
          USE_PROFILES: { html: true },
          FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
          FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover']
        });
      }
      return html;
    };
  }

  // Override runExternalSearch with deduped version
  window.runExternalSearch = async function(query, lang, includeForeign, targetEl, page) {
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
      results.forEach(r => {
        const key = (r.title||'').toLowerCase().trim().replace(/\s+/g,' ').slice(0,100) + '|' + (r.source||'');
        if (!seen.has(key)) seen.set(key, r);
        else {
          const prev = seen.get(key);
          if ((r.abstract||'').length > (prev.abstract||'').length) seen.set(key, r);
        }
      });
      results = Array.from(seen.values());

      // DEDUPE 2: sentences inside abstract - FIXES the screenshot duplication
      results = results.map(r => {
        if (!r.abstract) return r;
        const sentences = r.abstract.split(/(?<=[.!?])\s+/);
        const uniq = []; const set = new Set();
        sentences.forEach(s => {
          const k = s.trim().slice(0,80).toLowerCase();
          if (k.length < 10) { uniq.push(s); return; }
          if (!set.has(k)) { set.add(k); uniq.push(s); }
        });
        return {...r, abstract: uniq.join(' ')};
      });

      if (!results.length) {
        targetEl.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center text-gray-500"><i class="fa-solid fa-globe text-3xl mb-2 text-gray-300"></i><p>' + (lang === 'hu' ? (pg > 1 ? 'Nincs több találat.' : 'Nincs külső találat.') : (pg > 1 ? 'No more results.' : 'No external results.')) + '</p>' + (pg > 1 ? '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg - 1) + ')" class="mt-3 text-xs px-3 py-1.5 bg-gray-100 rounded-lg">← Vissza</button>' : '') + '</div>';
        return;
      }

      let html = '<div class="text-sm text-gray-500 mb-2 flex items-center justify-between"><span><i class="fa-solid fa-globe mr-1"></i>' + (lang === 'hu' ? 'Külső akadémiai találatok' : 'External academic results') + ' (' + results.length + ')</span><span class="text-xs">' + (lang === 'hu' ? 'Oldal' : 'Page') + ' ' + pg + '</span></div><div class="space-y-3">';
      for (const r of results) {
        const safeTitle = r.title || '';
        const safeAbstract = r.abstract ? (window.safeMarkdown ? window.safeMarkdown(r.abstract) : r.abstract) : '';
        const esc = (t) => { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; };
        html += '<div class="bg-white rounded-2xl p-4 shadow border border-gray-100"><div class="flex items-start gap-2 mb-1 flex-wrap"><span class="px-2 py-0.5 text-xs bg-purple-100 text-[#6C5CE7] rounded-full">' + esc(r.source||'') + '</span>' + (r.year ? '<span class="text-xs text-gray-500">' + r.year + '</span>' : '') + '</div><h4 class="font-semibold text-gray-900">' + esc(safeTitle) + '</h4>' + (r.authors ? '<p class="text-xs text-gray-500 mt-1">' + esc(r.authors) + '</p>' : '') + '<div class="text-sm text-gray-600 mt-2 prose prose-sm max-w-none">' + safeAbstract + '</div><div class="mt-3 flex gap-2 flex-wrap">' + (r.pdfUrl ? '<a href="' + esc(r.pdfUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"><i class="fa-solid fa-file-pdf"></i>PDF</a>' : '') + (r.sourceUrl ? '<a href="' + esc(r.sourceUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg"><i class="fa-solid fa-arrow-up-right-from-square"></i> Megnyitás</a>' : '') + '</div></div>';
      }
      html += '</div><div class="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">';
      if (pg > 1) html += '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg - 1) + ')" class="text-sm px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg"><i class="fa-solid fa-arrow-left"></i> Előző</button>'; else html += '<div></div>';
      html += '<span class="text-xs text-gray-500">Oldal ' + pg + '</span>';
      if (results.length >= 10) html += '<button onclick="window.runExternalSearch(window._externalSearchState.query, window._externalSearchState.lang, window._externalSearchState.includeForeign, window._externalSearchState.target, ' + (pg + 1) + ')" class="text-sm px-4 py-2 bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white rounded-lg">Következő <i class="fa-solid fa-arrow-right"></i></button>'; else html += '<div></div>';
      html += '</div>';
      targetEl.innerHTML = html;
    } catch (e) {
      console.error('External search error:', e);
      targetEl.innerHTML = '<div class="text-gray-400 text-sm">Külső keresés hiba: ' + e.message + '</div>';
    }
  };

  console.log('[AMISEARCH FIX] external search deduplication loaded - screenshot bug fixed');
})();
