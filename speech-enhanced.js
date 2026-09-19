// === AMISEARCH FELOLVASÁS — KÜLÖN FÁJL, NEM ÉRINTI AZ index.html-t ===
let beszeldomas = null;

window.felolvas = function(gomb) {
  const doboz = gomb.closest(".ai-output")?.dataset?.ttsSource 
             ? document.querySelector(gomb.closest(".ai-output").dataset.ttsSource)
             : gomb.closest(".ai-output");
  
  const szoveg = doboz?.textContent?.trim() || "";
  if (!szoveg) return;

  if (beszeldomas) window.speechSynthesis.cancel();
  
  beszeldomas = new SpeechSynthesisUtterance(szoveg);
  beszeldomas.lang = "hu-HU";
  beszeldomas.rate = 0.9;
  beszeldomas.volume = 1;

  gomb.style.display = "none";
  const leallito = gomb.nextElementSibling;
  if (leallito) leallito.style.display = "inline-flex";

  const vissza = () => {
    gomb.style.display = "inline-flex";
    if (leallito) leallito.style.display = "none";
    beszeldomas = null;
  };
  beszeldomas.onend = beszeldomas.oncancel = vissza;
  window.speechSynthesis.speak(beszeldomas);
};

window.leallit = function() {
  if (beszeldomas) {
    window.speechSynthesis.cancel();
    beszeldomas = null;
    document.querySelectorAll(".btn-tts-play").forEach(b => b.style.display = "inline-flex");
    document.querySelectorAll(".btn-tts-stop").forEach(b => b.style.display = "none");
  }
};

// Automatikus betöltés — CSAK EZ A SORT ADD HOZZÁ A SAJÁT FÜGGVÉNYEDHEZ
window.csillagozdFelAValaszokat = function() {
  document.querySelectorAll(".ai-output").forEach(elem => {
    if (!elem.nextElementSibling?.classList.contains("tts-sor")) {
      const sor = document.createElement("div");
      sor.className = "tts-sor";
      sor.style.cssText = "display:flex;gap:0.5rem;margin:0.5rem 0 1rem 0;";
      sor.innerHTML = `
        <button class="btn-tts-play" onclick="felolvas(this)" style="padding:0.5rem 1rem;border-radius:0.5rem;border:none;background:#EDE9FE;color:#5A4BD1;cursor:pointer;">🔊 Olvasd fel</button>
        <button class="btn-tts-stop" onclick="leallit()" style="padding:0.5rem 1rem;border-radius:0.5rem;border:none;background:#FEE2E2;color:#B91C1C;cursor:pointer;display:none;">🔇 Leállítás</button>
      `;
      elem.after(sor);
    }
  });
};

// Ha a meglévő kódodban van függvény ami új válasz után fut — egyszerűen hívd meg:
// csillagozdFelAValaszokat();
