// speech-tts.js — AMISEARCH felolvasás, index.html ÉRINTÉSE NÉLKÜL
// Betöltés: <script src="/speech-tts.js" defer></script>
// (ha már van script a head/footerben speech-enhanced.js-re, cseréld erre a fájlra)

(function () {
  "use strict";

  function stripForSpeech(text) {
    return String(text || "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]\([^)]*\)/g, function (_, a) {
        return a || "";
      })
      .replace(/#{1,6}\s*/g, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/\b(PDF|Word|Másolás|Copy|Felolvasás|Read aloud|Stop|Leállítás)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickLang() {
    return window.currentLang === "en" ? "en-US" : "hu-HU";
  }

  function pickVoice(lang) {
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var short = lang.slice(0, 2).toLowerCase();
      return (
        voices.find(function (v) {
          return (v.lang || "").toLowerCase() === lang.toLowerCase();
        }) ||
        voices.find(function (v) {
          return (v.lang || "").toLowerCase().indexOf(short) === 0;
        }) ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  window.stopAiAnswer = function () {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  window.readAiAnswer = function (btn) {
    if (!("speechSynthesis" in window)) {
      alert(
        window.currentLang === "en"
          ? "Speech not supported in this browser."
          : "A böngésző nem támogatja a felolvasást."
      );
      return;
    }

    var bubble =
      (btn && btn.closest && btn.closest("[data-ai-dl-toolbar]")) ||
      (btn && btn.parentElement);
    var root = bubble && bubble.parentElement ? bubble.parentElement : bubble;
    var textEl =
      (root && root.querySelector && root.querySelector("[id^='ai-msg-']")) ||
      (root && root.querySelector && root.querySelector("p")) ||
      root;

    var raw = (textEl && (textEl.innerText || textEl.textContent)) || "";
    var text = stripForSpeech(raw);
    if (!text) return;

    window.speechSynthesis.cancel();

    var u = new SpeechSynthesisUtterance(text);
    u.lang = pickLang();
    u.rate = 0.95;
    var voice = pickVoice(u.lang);
    if (voice) u.voice = voice;

    if (btn) btn.disabled = true;
    u.onend = function () {
      if (btn) btn.disabled = false;
    };
    u.onerror = function () {
      if (btn) btn.disabled = false;
    };

    window.speechSynthesis.speak(u);
  };

  function labelPlay() {
    return window.currentLang === "en" ? "Read aloud" : "Felolvasás";
  }
  function labelStop() {
    return "Stop";
  }

  function injectButtons(toolbar) {
    if (!toolbar || toolbar.getAttribute("data-tts-ready") === "1") return;
    // ha már van felolvasás gomb, ne duplázzuk
    if (toolbar.querySelector("[data-tts-play]")) {
      toolbar.setAttribute("data-tts-ready", "1");
      return;
    }

    var play = document.createElement("button");
    play.type = "button";
    play.setAttribute("data-tts-play", "1");
    play.className =
      "text-xs px-3 py-1.5 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-medium transition";
    play.innerHTML = '<i class="fa-solid fa-volume-high mr-1"></i>' + labelPlay();
    play.onclick = function () {
      window.readAiAnswer(play);
    };

    var stop = document.createElement("button");
    stop.type = "button";
    stop.setAttribute("data-tts-stop", "1");
    stop.className =
      "text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium transition";
    stop.innerHTML = '<i class="fa-solid fa-stop mr-1"></i>' + labelStop();
    stop.onclick = function () {
      window.stopAiAnswer();
    };

    // legelső gombok elé
    if (toolbar.firstChild) {
      toolbar.insertBefore(stop, toolbar.firstChild);
      toolbar.insertBefore(play, toolbar.firstChild);
    } else {
      toolbar.appendChild(play);
      toolbar.appendChild(stop);
    }

    toolbar.setAttribute("data-tts-ready", "1");
  }

  function scan() {
    document.querySelectorAll("[data-ai-dl-toolbar]").forEach(injectButtons);
  }

  // Hanglista előtöltés (Chrome)
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = function () {
        window.speechSynthesis.getVoices();
      };
    } catch (e) {}
  }

  // Automatikus beszúrás új AI válaszoknál
  if (typeof MutationObserver !== "undefined") {
    var obs = new MutationObserver(function () {
      scan();
    });
    if (document.body) {
      obs.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        obs.observe(document.body, { childList: true, subtree: true });
        scan();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scan);
  } else {
    scan();
  }

  // periodikus biztonsági háló (ha a toolbar később jelenik meg)
  setInterval(scan, 2000);

  console.log("✅ AMISEARCH speech-tts.js aktív (Felolvasás gomb automatikus)");
})();
