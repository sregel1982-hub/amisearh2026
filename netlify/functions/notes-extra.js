(function() {
// Helyi törölt jegyzetek tárolása localStorage-ban
  const HIDDEN_KEY = 'amisearch_hidden_notes';

  function getHidden() {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]'); }
    catch { return []; }
  }

  function saveHidden(arr) {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(arr));
  }

  function hideNote(noteId) {
    const hidden = getHidden();
    if (!hidden.includes(noteId)) hidden.push(noteId);
    saveHidden(hidden);
  }

  function unhideNote(noteId) {
    saveHidden(getHidden().filter(id => id !== noteId));
  }

  function isHidden(noteId) {
    return getHidden().includes(noteId);
  }

  // === JAVÍTÁS 1: Hiányzó letöltés függvény ===
  window.downloadNote = async function(noteId) {
    try {
      const resp = await fetch(`/.netlify/functions/download-note?id=${noteId}`, {
        headers: await window.getAuthHeaders({})
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Ismeretlen hiba' }));
        throw new Error(err.error || 'Letöltési hiba');
      }
      const data = await resp.json();
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        throw new Error('Nincs letöltési link');
      }
    } catch (e) {
      alert('Letöltési hiba: ' + e.message);
      console.error('downloadNote error:', e);
    }
  };

  // === JAVÍTÁS 2: Hiányzó összefoglaló függvény ===
  window.summarizeNote = async function(noteId, btn) {
    const originalHtml = btn.innerHTML;
    try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Feldolgozás...';

      const resp = await fetch('/.netlify/functions/summarize', {
        method: 'POST',
        headers: await window.getAuthHeaders({'Content-Type': 'application/json'}),
        body: JSON.stringify({ noteId, lang: window.currentLang === 'hu' ? 'hu' : 'en' })
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Ismeretlen hiba' }));
        throw new Error(err.error || 'Összefoglaló hiba');
      }
      const data = await resp.json();

      // Megjelenítés egy egyszerű modal-ban
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-900">${window.currentLang === 'hu' ? 'Összefoglaló' : 'Summary'}</h3>
            <button onclick="this.closest('.fixed').remove()" class="text-gray-500 hover:text-gray-700">
              <i class="fa-solid fa-times text-xl"></i>
            </button>
          </div>
          <div class="prose max-w-none text-gray-700 whitespace-pre-wrap">${(data.summary || 'Nincs összefoglaló').replace(/</g, '&lt;')}</div>
          <div class="mt-4 flex justify-end">
            <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 bg-[#6C5CE7] text-white rounded-lg hover:bg-[#5A4BD1]">
              ${window.currentLang === 'hu' ? 'Bezárás' : 'Close'}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    } catch (e) {
      alert('Hiba: ' + e.message);
      console.error('summarizeNote error:', e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  };

  // Az eredeti loadMyNotes felülírása
  const _origLoad = window.loadMyNotes;

  window.loadMyNotes = async function() {
    const container = document.getElementById('myNotesList');
    if (!container) return;
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';

    container.innerHTML = '<div class="flex items-center gap-2 text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin"></i><span>' +
      (lang === 'hu' ? 'Jegyzetek betöltése...' : 'Loading notes...') + '</span></div>';

    try {
      const resp = await fetch('/.netlify/functions/notes', {
        method: 'GET',
        headers: await window.getAuthHeaders({})
      });
      if (!resp.ok) {
        container.innerHTML = '<div class="text-sm text-red-500">' +
          (lang === 'hu' ? 'Hiba a lekéréskor.' : 'Failed to load.') + '</div>';
        return;
      }
      const all = await resp.json();
      const mine = Array.isArray(all)
        ? all.filter(n => n.uploaderIdentityId === window.currentUser?.id)
        : [];

      if (!mine.length) {
        container.innerHTML = '<div class="text-sm text-gray-500 italic">' +
          (lang === 'hu' ? 'Még nincs feltöltött jegyzeted.' : 'No notes yet.') + '</div>';
        return;
      }

      const hidden = getHidden();
      const visible = mine.filter(n => !hidden.includes(String(n.id)));
      const hiddenNotes = mine.filter(n => hidden.includes(String(n.id)));

      let html = '<div class="space-y-2" id="notesVisibleList">';

      visible.forEach(n => {
        const safeTitle = escHtml(n.title || n.originalName || ('Note #' + n.id));
        const subject = n.subject ? '<span class="text-xs text-gray-500 ml-2">' + escHtml(n.subject) + '</span>' : '';
        html += `
          <div class="flex items-center gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition" data-note-id="${n.id}">
            <input type="checkbox" class="note-hide-cb w-4 h-4 rounded text-red-500 focus:ring-red-400 cursor-pointer flex-shrink-0"
              title="${lang === 'hu' ? 'Elrejt (helyi)' : 'Hide locally'}"
              onchange="window.toggleNoteHide('${n.id}', this.checked)">
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900 truncate">${safeTitle}${subject}</p>
              <button onclick="window.downloadNote(${n.id})"
                class="text-xs text-[#6C5CE7] hover:underline mt-1">
                <i class="fa-solid fa-download mr-1"></i>${lang === 'hu' ? 'Letöltés' : 'Download'}
              </button>
            </div>
            <button onclick="window.summarizeNote(${n.id}, this)"
              class="text-xs px-3 py-1.5 bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white font-medium rounded-lg transition whitespace-nowrap">
              <i class="fa-solid fa-wand-magic-sparkles mr-1"></i>${lang === 'hu' ? 'Összefoglaló' : 'Summarize'}
            </button>
          </div>`;
      });

      html += '</div>';

      // Rejtett jegyzetek
      if (hiddenNotes.length > 0) {
        html += `
          <div class="mt-3">
            <button onclick="window.toggleHiddenSection()" 
              class="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <i class="fa-solid fa-eye-slash"></i>
              ${lang === 'hu' ? hiddenNotes.length + ' elrejtett jegyzet' : hiddenNotes.length + ' hidden note(s)'}
              <i class="fa-solid fa-chevron-down ml-1" id="hiddenChevron"></i>
            </button>
            <div id="hiddenNotesList" class="hidden mt-2 space-y-2 opacity-60">`;

        hiddenNotes.forEach(n => {
          const safeTitle = escHtml(n.title || n.originalName || ('Note #' + n.id));
          html += `
            <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg" data-note-id="${n.id}">
              <input type="checkbox" class="note-hide-cb w-4 h-4 rounded text-[#6C5CE7] cursor-pointer flex-shrink-0"
                checked
                title="${lang === 'hu' ? 'Visszaállítás' : 'Restore'}"
                onchange="window.toggleNoteHide('${n.id}', this.checked)">
              <p class="text-xs text-gray-500 truncate flex-1">${safeTitle}</p>
            </div>`;
        });

        html += '</div></div>';
      }

      // Összes visszaállítása gomb
      if (hiddenNotes.length > 0) {
        html += `
          <button onclick="window.restoreAllNotes()"
            class="mt-2 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition">
            <i class="fa-solid fa-rotate-left mr-1"></i>
            ${lang === 'hu' ? 'Összes visszaállítása' : 'Restore all'}
          </button>`;
      }

      container.innerHTML = html;

    } catch (e) {
      container.innerHTML = '<div class="text-sm text-red-500">' +
        (lang === 'hu' ? 'Hiba történt.' : 'An error occurred.') + '</div>';
      console.error('loadMyNotes error:', e);
    }
  };

  window.toggleNoteHide = function(noteId, isChecked) {
    if (isChecked) {
      hideNote(String(noteId));
    } else {
      unhideNote(String(noteId));
    }
    setTimeout(() => window.loadMyNotes(), 150);
  };

  window.toggleHiddenSection = function() {
    const sec = document.getElementById('hiddenNotesList');
    const chev = document.getElementById('hiddenChevron');
    if (!sec) return;
    sec.classList.toggle('hidden');
    if (chev) chev.style.transform = sec.classList.contains('hidden') ? '' : 'rotate(180deg)';
  };

  window.restoreAllNotes = function() {
    saveHidden([]);
    window.loadMyNotes();
  };

  function escHtml(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }
})();
