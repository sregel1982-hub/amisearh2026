// ===== AMISEARCH APP.JS - V7.1 =====
// - téma választó
// - practice PDF / Word letöltés
// - NEM írja felül a generatePractice AI-t
// - speech-tts.js automatikus betöltése (Felolvasás gomb, index.html nélkül)

const themes = {
  purple:  { primary: "#6C5CE7", hover: "#5A4BD1", light: "#EFEEFF", name: "🟣 Purple" },
  blue:    { primary: "#3B82F6", hover: "#2563EB", light: "#DBEAFE", name: "🔵 Blue" },
  emerald: { primary: "#10B981", hover: "#059669", light: "#D1FAE5", name: "🟢 Green" },
  orange:  { primary: "#F59E0B", hover: "#D97706", light: "#FEF3C7", name: "🟠 Orange" },
  pink:    { primary: "#EC4899", hover: "#DB2777", light: "#FCE7F3", name: "🔴 Pink" },
};

function initThemePicker() {
  if (document.getElementById("theme-picker")) return;

  const picker = document.createElement("div");
  picker.id = "theme-picker";
  picker.style.cssText =
    "position:fixed;bottom:20px;right:20px;z-index:10000;background:white;padding:15px;" +
    "border-radius:50px;display:flex;gap:8px;box-shadow:0 8px 25px rgba(0,0,0,0.15);border:2px solid #eee;";

  Object.entries(themes).forEach(function (entry) {
    const key = entry[0];
    const theme = entry[1];
    const circle = document.createElement("button");
    circle.type = "button";
    circle.title = theme.name;
    circle.style.cssText =
      "width:35px;height:35px;border-radius:50%;background:" +
      theme.primary +
      ";cursor:pointer;border:3px solid white;";
    circle.textContent = theme.name.charAt(0);
    circle.onclick = function () {
      applyTheme(key);
    };
    picker.appendChild(circle);
  });

  document.body.appendChild(picker);
  applyTheme(localStorage.getItem("amisearch-theme") || "purple");
}

function applyTheme(name) {
  const t = themes[name];
  if (!t) return;

  let st = document.getElementById("dynamic-theme-style");
  if (!st) {
    st = document.createElement("style");
    st.id = "dynamic-theme-style";
    document.head.appendChild(st);
  }

  st.innerHTML =
    ":root{--primary:" +
    t.primary +
    "!important}" +
    ".btn-primary,button[type=\"submit\"]{background:" +
    t.primary +
    "!important}" +
    "a{color:" +
    t.primary +
    "!important}";

  localStorage.setItem("amisearch-theme", name);
}

function isImageRequest(txt) {
  const q = String(txt || "").toLowerCase();
  return /kép|képet|képek|fotó|fotót|rajz|illusztr|ábra|image|photo|picture|illustration/.test(q);
}

function guardImagePrompt(q) {
  let subject = String(q || "")
    .replace(/kép kellene egy|képet kérek|rajzolj egy|mutass egy|mutass|keress|show me|find/gi, "")
    .trim();
  const lower = String(q || "").toLowerCase();
  const wantsHuman = /ember|portré|személy|person|portrait|human/.test(lower);
  if (!wantsHuman) {
    return (
      subject +
      ", photorealistic photo, real animal or object, not a book cover, not illustration of a cover, high detail, 4k"
    );
  }
  return subject + ", photorealistic, high detail, 4k";
}

// ---- Practice panel: csak letöltés (generálást az index.html AI-s generatePractice végzi) ----

window.downloadPracticeAsPDF = async function () {
  if (!window.html2pdf) {
    await new Promise(function (res) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
      s.onload = res;
      document.head.appendChild(s);
    });
  }

  const el = document.getElementById("practiceOutput");
  if (!el) return;

  const clone = el.cloneNode(true);
  clone.style.padding = "20px";
  clone.style.background = "white";

  const header = document.createElement("div");
  header.innerHTML =
    '<div style="text-align:center;color:#6C5CE7;font-weight:700;font-size:20px;' +
    'border-bottom:2px solid #6C5CE7;padding-bottom:8px;margin-bottom:15px;">AMISEARCH • amisearch.org</div>';
  clone.prepend(header);

  const opt = {
    margin: [15, 12, 15, 12],
    filename: "AMISEARCH-" + Date.now() + ".pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#fff" },
    jsPDF: { unit: "mm", format: "a4" },
  };

  html2pdf().set(opt).from(clone).save();
};

window.downloadPracticeAsWord = async function () {
  const topic = (document.getElementById("practiceTopicInput") &&
    document.getElementById("practiceTopicInput").value) || "Feladatok";
  const content =
    (document.getElementById("practiceOutput") &&
      document.getElementById("practiceOutput").innerText) || "Feladatok";

  const html =
    "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"></head><body><h1>" +
    topic +
    "</h1><div>" +
    String(content).replace(/\n/g, "<br>") +
    "</div></body></html>";

  const blob = new Blob([html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = topic + ".doc";
  a.click();
  URL.revokeObjectURL(url);
};

// Opcionális: képkérés jelölése a body-ban (a chat.mjs nem függ tőle)
(function () {
  const orig = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (url && url.indexOf("/.netlify/functions/") !== -1 && init && init.body) {
      try {
        const body = JSON.parse(init.body);
        const q = body.message || body.query || body.prompt || body.content || "";
        if (isImageRequest(q)) {
          body.safePrompt = guardImagePrompt(q);
          body.isImageRequest = true;
          init = Object.assign({}, init, { body: JSON.stringify(body) });
        }
      } catch (e) {}
    }
    return orig(input, init);
  };
})();

function boot() {
  initThemePicker();
  // NE írd felül: window.generatePractice
  // Az index.html AI-s generatePractice / generateExamSimulator marad.
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}

// Felolvasás: speech-tts.js betöltése index.html nélkül
(function loadSpeechTts() {
  if (document.querySelector('script[data-amisearch-tts]')) return;
  const s = document.createElement("script");
  s.src = "/speech-tts.js?v=2";
  s.defer = true;
  s.setAttribute("data-amisearch-tts", "1");
  document.head.appendChild(s);
})();

console.log("✅ AMISEARCH APP.JS V7.1 – theme, PDF/Word, speech-tts loader, generatePractice érintetlen");
