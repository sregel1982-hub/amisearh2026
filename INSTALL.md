# AMISEARCH – Markdown renderelő javítás (committolható csomag)

## Mi volt a hiba?

A `amisearch-gemini-notes.js` eredeti `renderMarkdown()` függvénye kizárólag a
`marked` globális változóra támaszkodott. Amikor a CDN-ről nem töltődött be
(reklámblokkoló, hálózati hiba, CSP-strict), a szöveg **nyers Markdown**
formában jelent meg (`#`, `**`, `*`, `---` karakterek látszottak).

## Mit csinál ez a csomag?

Háromrétegű fallback láncot épít fel:

1. **Ha `marked` elérhető** → `marked.parse(text)` (változatlan gyors út).
2. **Ha nincs `marked`** → a loader sorrendben próbálja a 4 CDN-t
   (`cdn.jsdelivr.net` → `unpkg.com` → `cdnjs.cloudflare.com` → `esm.sh`),
   és amelyik elsőként betöltődik, az lesz a használt motor.
3. **Ha minden CDN blokkolva van** → a beépített `AMISEARCH_MINI.render()`
   dolgozza fel a szöveget. Ez kezeli a `#`, `##`, `###`, `**`, `*`, `---`,
   számozott/számozatlan listákat, idézetet (`> …`), inline kódot (`` `…` ``)
   és fenced kódblokkot (```` ``` … ``` ````).

A teljes folyamatban **a felhasználói tartalom mindig HTML-escape-elve** megy
tovább, így XSS-támadás nem lehetséges.

## Fájlok

| Fájl | Funkció |
|---|---|
| `markdown-loader.js` | CDN-lánc + `safeMarkdown` / `renderMarkdownSafe` definiálása |
| `markdown-fallback.js` | Beépített mini-renderer (AMISEARCH_MINI.render) |
| `markdown-patch.css` | A mini-renderer kimenetének stíluslapja |
| `amisearch-gemini-notes.js` | Az eredeti fájl JAVÍTOTT verziója |
| `fix_external_dedupe.js` | Az eredeti fájl JAVÍTOTT verziója |

## Telepítés

### 1. A négy fájlt másold a projekt gyökerébe (a `/` mappába)

A Netlify-n a `publish = "."` mappába kell kerülniük.

### 2. A `Vizsgaszimulátor` (és minden AI-választ megjelenítő) HTML-oldal `<head>`-jébe szúrd be ezt a két scriptet:

```html
<link rel="stylesheet" href="/markdown-patch.css">
<script src="/markdown-fallback.js" defer></script>
<script src="/markdown-loader.js" defer></script>
```

A sorrend fontos: először a fallback töltődik be (még a `marked` előtt),
aztán a loader elindítja a CDN-próbálkozásokat.

### 3. A `head` után (vagy az oldal alján) szúrd be a frissített két scriptet:

```html
<script src="/amisearch-gemini-notes.js" defer></script>
<script src="/fix_external_dedupe.js" defer></script>
```

### 4. Netlify deploy

A Vite-buildben a `markdown-fallback.js`, `markdown-loader.js` és
`markdown-patch.css` automatikusan kimásolódik a `dist` mappába,
mert nem importálja őket senki (statikus public assetnek számítanak).

Ha Vite **nem** építi be a public mappát, tedd őket a `public/` almappába:

```
public/
  ├ markdown-fallback.js
  ├ markdown-loader.js
  ├ markdown-patch.css
  ├ amisearch-gemini-notes.js     (felülírja az eredetit)
  └ fix_external_dedupe.js        (felülírja az eredetit)
```

A Vite a `public/` tartalmát változtatás nélkül másolja a `dist/`-be,
így a `/markdown-loader.js` URL az éles oldalon is elérhető lesz.

## Visszaállítás

Ha bármi baj van, csak töröld az új fájlokat (`markdown-*.js`, `markdown-*.css`)
és a HTML-ekből vedd ki a fenti két script-sort. Az eredeti
`amisearch-gemini-notes.js` és `fix_external_dedupe.js` megmaradnak –
csak ki kell cserélni őket az eredeti verzióra.

## Kompatibilitás

- Modern böngészők: teljes támogatás (Chrome, Firefox, Safari, Edge).
- Internet Explorer 11: a `CustomEvent` és `addEventListener` támogatott,
  de a `defer` Vite-buildben nem kell polyfill.
- Reklámblokkolókkal: működik, mert a `markdown-fallback.js` teljesen lokális.
- Offline: működik, ugyanazért.
- CSP-strict (`script-src 'self'`): a public mappás megoldással kompatibilis,
  mert csak a `/markdown-loader.js` stb. lokális útvonal.

## Commit üzenet

```
fix(chat): 3-rétegű Markdown render fallback lánc – CDN blokk / reklámszűrő esetén is működik

- Hozzáadva: /markdown-loader.js (4 CDN fallback + safeMarkdown)
- Hozzáadva: /markdown-fallback.js (beépített mini-renderer)
- Hozzáadva: /markdown-patch.css  (mini-renderer stíluslap)
- Módosítva: /amisearch-gemini-notes.js → renderMarkdown 4 szintű fallback
- Módosítva: /fix_external_dedupe.js   → csak akkor definiál safeMarkupot, ha nincs
```
