/* ============================================================
 *  AMISEARCH – Beépített Markdown fallback renderer
 *  ----------------------------------------------------------
 *  Akkor fut le, amikor a `marked` globális nem érhető el
 *  (CDN blokkolt, reklámszűrős hálózat, offline mód stb.).
 *
 *  Kezeli a Vizsgaszimulátor és az AI-jegyzetek leggyakoribb
 *  szintaxisát:
 *    - címsorok:    # / ## / ###
 *    - félkövér:    **szöveg**
 *    - dőlt:        *szöveg*   (a **-nél HAMARABB fut le)
 *    - vízszintes:   --- önmagában
 *    - számozatlan: - elem
 *    - számozott:   1. elem
 *    - idézet:       > szöveg
 *    - inline kód:   `szöveg`
 *    - kódblokk:     ``` … ```
 *
 *  Használat:
 *    <script src="/markdown-fallback.js" defer></script>
 *    <script>
 *      window.renderMarkdownSafe = function (text) {
 *        if (typeof marked !== 'undefined') return marked.parse(text);
 *        return AMISEARCH_MINI.render(text);
 *      };
 *    </script>
 * ============================================================ */
(function (root) {
  'use strict';

  // ------------------------------------------------------------------
  // 0) HTML escape – ez a legfontosabb biztonsági réteg.
  //    A bemenetet MINDIG átfuttatjuk rajta, és csak a mi saját
  //    <strong>, <em> … címkéinket hagyjuk érintetlenül.
  // ------------------------------------------------------------------
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ------------------------------------------------------------------
  // 1) A kódblokkokat és inline kódokat kiemeljük, hogy a további
  //    regex-ek ne nyúljanak bele.
  // ------------------------------------------------------------------
  function extractCodeBlocks(src) {
    const codeBlocks = [];
    const inlineCodes = [];
    let s = src;

    // Fenced code block: ``` … ```
    s = s.replace(/```([\s\S]*?)```/g, function (_m, body) {
      codeBlocks.push(body);
      return '\u0000CODEBLOCK_' + (codeBlocks.length - 1) + '\u0000';
    });

    // Inline code: ` … `  (vigyázunk, hogy ne nyeljük fel a `**` belsejét)
    s = s.replace(/`([^`\n]+?)`/g, function (_m, body) {
      inlineCodes.push(body);
      return '\u0000INLINECODE_' + (inlineCodes.length - 1) + '\u0000';
    });

    return { text: s, codeBlocks: codeBlocks, inlineCodes: inlineCodes };
  }

  function restoreTokens(html, extracted) {
    let out = html;
    extracted.inlineCodes.forEach(function (body, i) {
      out = out.split('\u0000INLINECODE_' + i + '\u0000').join(
        '<code class="ami-inline-code">' + esc(body) + '</code>'
      );
    });
    extracted.codeBlocks.forEach(function (body, i) {
      out = out.split('\u0000CODEBLOCK_' + i + '\u0000').join(
        '<pre class="ami-codeblock"><code>' + esc(body) + '</code></pre>'
      );
    });
    return out;
  }

  // ------------------------------------------------------------------
  // 2) A tényleges mini-Markdown → HTML átalakítás.
  //    Minden regex az `esc(text)`-en fut, így a felhasználói
  //    tartalom soha nem kerülhet be nyersen a HTML-be.
  // ------------------------------------------------------------------
  function renderInner(rawText) {
    // Lépés 0: escape
    let text = esc(rawText);

    // Lépés 1: kódblokkok elkülönítése (később visszahelyezzük)
    const ex = extractCodeBlocks(rawText);
    text = esc(ex.text);

    // Lépés 2: blokk-szintű szabályok

    // Vízszintes elválasztó: --- önmagában egy sorban.
    text = text.replace(/^---[ \t]*$/gm, '<hr class="ami-hr">');

    // Címsorok – a hosszabbtól a rövidebb felé haladunk, hogy
    // a "##" ne nyelje el a "###"-t.
    text = text.replace(/^### (.+?)\s*$/gm, '<h3 class="ami-h3">$1</h3>');
    text = text.replace(/^## (.+?)\s*$/gm, '<h2 class="ami-h2">$1</h2>');
    text = text.replace(/^# (.+?)\s*$/gm, '<h1 class="ami-h1">$1</h1>');

    // Idézet: > szöveg
    text = text.replace(/^&gt; (.+?)\s*$/gm, '<blockquote class="ami-quote">$1</blockquote>');

    // Számozott lista – nem kell szigorú számozás, mert a HTML
    // böngészője úgyis újrasorszámoz.
    text = text.replace(/^(\d+)\. (.+?)\s*$/gm, '<li class="ami-oli">$2</li>');

    // Számozatlan lista: - elem  vagy  * elem
    text = text.replace(/^[-*] (.+?)\s*$/gm, '<li class="ami-uli">$1</li>');

    // Lépés 3: inline szabályok

    // Félkövér: **szöveg**  (HAMARABB, mint a *-os dőlt!)
    text = text.replace(/\*\*([^*\n]+?)\*\*/g, '<strong class="ami-strong">$1</strong>');

    // Dőlt: *szöveg*  (kikerüljük, ha ** belsejében van)
    text = text.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em class="ami-em">$2</em>');

    // Lépés 4: listák csoportosítása <ul> / <ol> wrapperbe
    text = groupLists(text);

    // Lépés 5: kód-tokenek visszahelyezése
    text = restoreTextTokens(text, ex);

    // Lépés 6: dupla sortörés → bekezdés, egy sortörés → <br>
    text = paragraphs(text);

    return text;
  }

  function restoreTextTokens(html, ex) {
    let out = html;
    ex.inlineCodes.forEach(function (body, i) {
      out = out.split('\u0000INLINECODE_' + i + '\u0000').join(
        '<code class="ami-inline-code">' + esc(body) + '</code>'
      );
    });
    ex.codeBlocks.forEach(function (body, i) {
      out = out.split('\u0000CODEBLOCK_' + i + '\u0000').join(
        '<pre class="ami-codeblock"><code>' + esc(body) + '</code></pre>'
      );
    });
    return out;
  }

  // Szomszédos <li class="ami-uli">…</li> és <li class="ami-oli">…</li>
  // blokkokat <ul> / <ol> wrapperbe tesszük.  A HTML-ünk escape-elt
  // formában van, ezért a széleken a < előtag &lt; volt – ezt most
  // visszaalakítjuk sztring-replacement előtt.
  function groupLists(html) {
    // Számozatlan
    html = html.replace(
      /((?:&lt;li class="ami-uli"&gt;.*?&lt;\/li&gt;\s*?)+)/g,
      function (m) {
        return '<ul class="ami-ul">' + m.replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '</ul>';
      }
    );
    // Számozott
    html = html.replace(
      /((?:&lt;li class="ami-oli"&gt;.*?&lt;\/li&gt;\s*?)+)/g,
      function (m) {
        return '<ol class="ami-ol">' + m.replace(/&lt;/g, '<').replace(/&gt;/g, '>') + '</ol>';
      }
    );
    // Visszamaradt önálló <li …>…</li> szintén (ha az esc miatt
    // másképp nézett ki, itt is becsomagoljuk):
    html = html.replace(/<li class="ami-uli">[^]*?<\/li>(\s*<li class="ami-uli">[^]*?<\/li>)*/g,
      function (m) { return '<ul class="ami-ul">' + m + '</ul>'; });
    html = html.replace(/<li class="ami-oli">[^]*?<\/li>(\s*<li class="ami-oli">[^]*?<\/li>)*/g,
      function (m) { return '<ol class="ami-ol">' + m + '</ol>'; });
    return html;
  }

  function paragraphs(html) {
    // Dupla sortörés → bekezdés
    html = html.replace(/\n\s*\n/g, '</p><p class="ami-p">');
    // Egy sortörés → <br> (kivéve, ha sortörés lista / címsor mellett van,
    // ezt a HTML böngésző maga oldja fel a whitespace-szabállyal)
    html = html.replace(/\n/g, '<br>');
    // Ha az egész szöveg egyetlen bekezdés, csomagoljuk <p> … </p>-be
    if (!/^<(h\d|ul|ol|pre|hr|blockquote)/i.test(html.trim())) {
      html = '<p class="ami-p">' + html + '</p>';
    }
    return html;
  }

  // ------------------------------------------------------------------
  // 3) Publikus API.  A `render()` függvény a teljes folyamatot futtatja.
  // ------------------------------------------------------------------
  function render(rawText) {
    if (rawText == null) return '';
    try {
      return renderInner(rawText);
    } catch (e) {
      // Végső fallback: ha bármi elromlik, legalább olvasható
      // szöveget adjunk vissza (escape-elve).
      return '<pre class="ami-error">' + esc(String(e.message || e)) +
             '\n\n' + esc(rawText) + '</pre>';
    }
  }

  // ------------------------------------------------------------------
  // 4) Export.  Globálisan elérhető: AMISEARCH_MINI.render(text)
  // ------------------------------------------------------------------
  root.AMISEARCH_MINI = {
    render: render,
    esc: esc,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : this);
