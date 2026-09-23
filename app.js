'use strict';

/**
 * public/app.js
 * ---------------------------------------------------------------------------
 * A felület logikája:
 *   1. Kérdezz  -> POST /api/answer  (Gemini elsodleges, Grok tartalek: a szerveren)
 *   2. Markdown -> HTML (marked), majd KaTeX auto-render -> IGAZI tortek a kepernyon
 *   3. kepkereses -> az /api/answer mar visszaadja a kepeket (Google CSE / Wikimedia)
 *   4. PDF letoltese -> POST /api/pdf (a szerver LaTeX-szel fordit) -> Blob letoltes
 *
 * Miért igy: a bongeszo-oldali HTML->PDF konverterek elrontjak a KaTeX-et,
 * ezert a PDF-et a szerver allitja elo igazi TeX-motorral.
 * ---------------------------------------------------------------------------
 */

(function () {
  const el = (id) => document.getElementById(id);
  const state = { markdown: '', images: [], sources: [] };

  /* --------------------------------------------------- KaTeX beallitasok */

  const KATEX_OPTIONS = {
    delimiters: [
      { left: '$$', right: '$$', display: true },
      { left: '\\[', right: '\\]', display: true },
      { left: '$', right: '$', display: false },
      { left: '\\(', right: '\\)', display: false },
    ],
    throwOnError: false,
    errorColor: '#DC2626',
    macros: { '\\RR': '\\mathbb{R}', '\\NN': '\\mathbb{N}', '\\ZZ': '\\mathbb{Z}' },
  };

  marked.setOptions({ breaks: true, gfm: true });

  function setStatus(message, kind) {
    const box = el('status');
    if (!message) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.className = 'status' + (kind ? ' ' + kind : '');
    box.textContent = message;
  }

  /** Markdown + LaTeX -> HTML, KaTeX-csel. */
  function renderInto(container, markdown) {
    container.innerHTML = marked.parse(markdown || '');
    renderMathInElement(container, KATEX_OPTIONS);
    container.querySelectorAll('h2').forEach((h) => {
      if (/(megold|megfejt|eredm|solution|answer|válasz)/i.test(h.textContent || '')) h.classList.add('sol');
    });
  }

  function showImages(items) {
    const box = el('images');
    if (!items || !items.length) { box.innerHTML = ''; return; }
    box.innerHTML = items.map((item) => {
      const caption = [item.title, item.credit, item.license].filter(Boolean).join(' — ');
      const safeCaption = caption.replace(/[<>&]/g, '');
      return '<figure>'
        + '<img src="' + item.imageUrl + '" alt="' + safeCaption + '" loading="lazy" '
        + 'onerror="this.closest(\'figure\').style.display=\'none\'">'
        + '<figcaption>' + safeCaption + '</figcaption></figure>';
    }).join('');
  }

  function showSources(list) {
    const box = el('sources');
    if (!list || !list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h3>Források</h3><ol>'
      + list.map((s) => '<li><a href="' + s.url + '" target="_blank" rel="noopener">'
          + (s.title || s.url).replace(/[<>&]/g, '') + '</a></li>').join('')
      + '</ol>';
  }

  /* --------------------------------------------------------------- kerdes */

  async function ask() {
    const question = el('question').value.trim();
    if (!question) { setStatus('Írj be egy kérdést.', 'error'); return; }

    const buttons = [el('ask'), el('pdf')];
    buttons.forEach((b) => { b.disabled = true; });
    setStatus('A modell dolgozik… (Gemini, hiba esetén Grok)');
    el('answer').innerHTML = '';
    el('answer').classList.remove('empty');
    el('images').innerHTML = '';
    el('sources').innerHTML = '';

    try {
      const res = await fetch('/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          images: el('withImages').checked,
          imageCount: 3,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || ('HTTP ' + res.status));

      state.markdown = data.answer || '';
      state.images = data.images || [];
      state.sources = data.sources || [];

      renderInto(el('answer'), state.markdown);
      showSources(state.sources);
      showImages(state.images);

      el('texOut').textContent = state.markdown;
      if (el('showTex').checked) el('texCard').hidden = false;

      const notes = [];
      notes.push('Válasz: ' + (data.provider || '?') + (data.model ? ' (' + data.model + ')' : ''));
      if (data.warnings && data.warnings.length) notes.push('Matek-ellenőr: ' + data.warnings.join(' '));
      if (data.imageErrors && data.imageErrors.length && !state.images.length) notes.push(data.imageErrors.join(' '));
      setStatus(notes.join(' • '), (data.warnings && data.warnings.length) ? '' : 'ok');
    } catch (error) {
      setStatus('Hiba: ' + (error && error.message ? error.message : 'ismeretlen'), 'error');
    } finally {
      buttons.forEach((b) => { b.disabled = false; });
    }
  }

  /* ------------------------------------------------------------------ PDF */

  async function downloadPdf() {
    if (!state.markdown) { setStatus('Előbb kérdezz, hogy legyen mit PDF-be tenni.', 'error'); return; }
    const btn = el('pdf');
    btn.disabled = true;
    setStatus('A szerver fordítja a PDF-et (xelatex/pdflatex)…');

    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          markdown: state.markdown,
          meta: {
            title: 'AMISEARCH',
            subtitle: 'AI válasz',
            date: new Date().toLocaleString('hu-HU', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit', second: '2-digit'
            })
          },
          images: state.images,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error([data.error, data.details].filter(Boolean).join(' — ') || ('HTTP ' + res.status));
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'amiseach-' + Date.now() + '.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus('A PDF elkészült és letöltődött. Motor: ' + (res.headers.get('X-AMISEARCH-Engine') || 'TeX'), 'ok');
    } catch (error) {
      setStatus('A PDF nem készült el: ' + (error && error.message ? error.message : 'ismeretlen'), 'error');
    } finally {
      btn.disabled = false;
    }
  }

  /* --------------------------------------------------------------- indulás */

  function init() {
    el('ask').addEventListener('click', ask);
    el('pdf').addEventListener('click', downloadPdf);
    el('showTex').addEventListener('change', (e) => { el('texCard').hidden = !e.target.checked; });
    el('question').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ask();
    });
    window.addEventListener('load', () => {
      if (typeof renderMathInElement === 'function') renderInto(el('answer'), el('answer').textContent);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
