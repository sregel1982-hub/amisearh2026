/**
 * AMISEARCH - Felolvasás (Text-to-Speech)
 * Egyszerű, böngésző beépített beszédszintézis – nincs API kulcs, nincs szerver.
 * Működik Chrome, Edge, Safari, Firefox legtöbb verziójában.
 *
 * Használat:
 * 1. Másold be ezt a fájlt a projektbe
 * 2. Add hozzá a HTML-hez: <script src="felolvasas.js"></script>
 * 3. Bármelyik elemre tedd rá a class-t: class="felolvashato"
 * 4. Vagy hívod programozottan: felolvas("Szöveg amit fel akarok olvastatni");
 */

(function () {
  "use strict";

  // ===== BEÁLLÍTÁSOK =====
  const DEFAULT_LANG = "hu-HU";   // Magyar
  const DEFAULT_RATE = 1.0;       // Sebesség (0.5 – 2.0)
  const DEFAULT_PITCH = 1.0;      // Hangmagasság
  const DEFAULT_VOLUME = 1.0;     // Hangereje

  let currentUtterance = null;
  let isSpeaking = false;

  /**
   * Fő függvény – felolvas egy szöveget
   * @param {string} text - A felolvasandó szöveg
   * @param {object} options - Opcionális beállítások {lang, rate, pitch, volume}
   */
  function felolvas(text, options = {}) {
    if (!window.speechSynthesis) {
      alert("A böngésződ nem támogatja a felolvasást (speechSynthesis).");
      return;
    }

    // Ha már beszél, állítsuk le
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || DEFAULT_LANG;
    utterance.rate = options.rate || DEFAULT_RATE;
    utterance.pitch = options.pitch || DEFAULT_PITCH;
    utterance.volume = options.volume || DEFAULT_VOLUME;

    // Magyar hang keresése (ha elérhető)
    const voices = window.speechSynthesis.getVoices();
    const huVoice = voices.find(v => v.lang.startsWith("hu")) ||
                    voices.find(v => v.lang.startsWith("hu-HU"));
    if (huVoice) {
      utterance.voice = huVoice;
    }

    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend = () => { isSpeaking = false; currentUtterance = null; };
    utterance.onerror = () => { isSpeaking = false; currentUtterance = null; };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  /**
   * Leállítás
   */
  function leallitas() {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      currentUtterance = null;
    }
  }

  /**
   * Szünet / folytatás
   */
  function szunet() {
    if (!window.speechSynthesis) return;
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Automatikus gombok létrehozása minden .felolvashato elemhez
   */
  function initButtons() {
    document.querySelectorAll(".felolvashato").forEach(el => {
      // Ha már van gomb, ne csináljunk újat
      if (el.querySelector(".felolvas-gomb")) return;

      const btn = document.createElement("button");
      btn.className = "felolvas-gomb";
      btn.innerHTML = "🔊 Felolvasás";
      btn.title = "Szöveg felolvasása";
      btn.style.cssText = `
        margin-left: 8px;
        padding: 4px 10px;
        font-size: 13px;
        background: #1a56db;
        color: white;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        vertical-align: middle;
      `;

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        // A szöveg az elemből (vagy data-text attribútumból)
        const text = el.getAttribute("data-text") || el.innerText || el.textContent;
        if (text.trim()) {
          felolvas(text.trim());
        }
      });

      // Gomb hozzáadása az elem végére
      el.appendChild(btn);
    });
  }

  // ===== GLOBÁLIS ELÉRÉS =====
  window.felolvas = felolvas;
  window.felolvasLeallitas = leallitas;
  window.felolvasSzuenet = szunet;

  // Oldal betöltésekor inicializálás
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      // Néhány böngészőben a hangok később töltődnek be
      window.speechSynthesis.onvoiceschanged = initButtons;
      initButtons();
    });
  } else {
    window.speechSynthesis.onvoiceschanged = initButtons;
    initButtons();
  }

  console.log("✅ AMISEARCH Felolvasás modul betöltve. Használat: felolvas('szöveg')");
})();

