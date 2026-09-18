// utils/speech.js – AMISEARCH Hang (TTS)

export function speakText(text, lang = "hu-HU") {
  if (!window.speechSynthesis) {
    console.warn("A böngésző nem támogatja a Speech Synthesis-t");
    return;
  }

  // Megállítjuk az előző beszédet
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Magyar hang prioritás
  utterance.lang = lang;
  utterance.rate = 0.95;      // kicsit lassabb, érthetőbb
  utterance.pitch = 1.0;
  utterance.volume = 1.0;

  // Magyar hang keresése
  const voices = window.speechSynthesis.getVoices();
  const hungarianVoice = voices.find(v => 
    v.lang.startsWith("hu") || 
    v.name.toLowerCase().includes("hungarian") ||
    v.name.toLowerCase().includes("magyar")
  );

  if (hungarianVoice) {
    utterance.voice = hungarianVoice;
  }

  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

// Hanglista betöltése (Chrome-ban néha késik)
export function loadVoices() {
  return new Promise((resolve) => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      resolve(voices);
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        resolve(window.speechSynthesis.getVoices());
      };
    }
  });
}
