// utils/tts.js – AMISEARCH felolvasás (Web Speech API, ingyenes, kliensoldali)
// Használat a widgetben:
//   import { readAloud, stopReading, isReading } from "./utils/tts.js";
//   <button onclick="readAloud(currentAiAnswerText)">🔊 Felolvasás</button>

let currentUtterance = null;

// Markdown jelek eltávolítása, hogy ne "hash hash cím" jellegű dolgokat mondjon fel
function stripMarkdown(text) {
  return String(text || "")
    .replace(/!\[.*?\]\(.*?\)/g, "")      // képek
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")   // linkek -> csak a szöveg
    .replace(/#{1,6}\s?/g, "")            // címsorok
    .replace(/\*\*(.+?)\*\*/g, "$1")      // félkövér
    .replace(/\*(.+?)\*/g, "$1")          // dőlt
    .replace(/^[•\-\*]\s?/gm, "")         // listajelek
    .replace(/\n{2,}/g, ". ")             // bekezdéshatár -> szünet
    .replace(/\n/g, " ")
    .trim();
}

// Megpróbál magyar hangot választani, ha van telepítve; egyébként az alapértelmezettet használja
function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find(v => v.lang?.toLowerCase() === lang.toLowerCase()) ||
    voices.find(v => v.lang?.toLowerCase().startsWith(lang.slice(0, 2))) ||
    null
  );
}

/**
 * Felolvassa a megadott szöveget.
 * @param {string} text - a felolvasandó (markdown formázású) szöveg
 * @param {object} [options]
 * @param {string} [options.lang="hu-HU"] - nyelvi kód
 * @param {number} [options.rate=1] - beszédsebesség (0.5–2)
 * @param {() => void} [options.onEnd] - callback, ha végzett
 */
export function readAloud(text, options = {}) {
  if (!("speechSynthesis" in window)) {
    console.warn("A böngésző nem támogatja a Web Speech API-t.");
    return false;
  }

  const { lang = "hu-HU", rate = 1, onEnd } = options;

  // Előző felolvasás megszakítása, hogy ne csússzanak egymásra
  window.speechSynthesis.cancel();

  const plain = stripMarkdown(text);
  if (!plain) return false;

  const utterance = new SpeechSynthesisUtterance(plain);
  utterance.lang = lang;
  utterance.rate = rate;

  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;

  utterance.onend = () => {
    currentUtterance = null;
    if (typeof onEnd === "function") onEnd();
  };
  utterance.onerror = () => {
    currentUtterance = null;
  };

  currentUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopReading() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  currentUtterance = null;
}

export function isReading() {
  return "speechSynthesis" in window && window.speechSynthesis.speaking;
}

// Néhány böngészőben (pl. Chrome) a hanglista aszinkron töltődik be —
// ez előre "bemelegíti", hogy a pickVoice() már találjon magyar hangot.
if (typeof window !== "undefined" && "speechSynthesis" in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

