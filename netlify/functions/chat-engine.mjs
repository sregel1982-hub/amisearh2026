// chat-engine.mjs - AMISEARCH - VÉGSŐ FORMÁZÁS JAVÍTÁS
import { GoogleGenAI } from "@google/genai";
import { checkQuota, incrementUsage } from "./quota.js";
import { webSearch } from "./search-utils.mjs";

const getEnv = (key) => 
  process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get?.(key));

const geminiAi = getEnv("GEMINI_API_KEY") 
  ? new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") }) 
  : null;

const hasGroq = !!getEnv("GROQ_API_KEY");
const hasGemini = !!getEnv("GEMINI_API_KEY");

// ==============================================
// ✅ KULCS: Rendszerüzenet — AZ AI ELEVE JÓL FORMÁZZON
// ==============================================
function buildSystemInstruction() {
  return `Te vagy az AMISEARCH oktatósegédje.
Mindig a felhasználó kérdésével MEGEGYEZŐ nyelven válaszolj!
Használj helyes magyar ékezeteket: ő, ű, á, é, í, ó, ú, ö, ü, Ő, Ű, Á, É, Í, Ó, Ú, Ö, Ü.

## KÖTELEZŐ FORMÁZÁSI SZABÁLYOK — MINDIG TARTSD BE:
- Minden bekezdés KÜLÖN SORON kezdődjön!
- Bekezdések között HAGYJ ÜRES SORT!
- Fejezetcímek: ## jelöléssel, SAJÁT SORON, előtte-utána üres sor
- Felsorolás: minden elem KÜLÖN SORON kezdődjön • vagy számmal
- Soha NE írj több mondatot egy sorba!
- Soha NE egyesítsd a felsorolás elemeit egy sorba!
- Ne legyen 5-nél több egymás utáni üres sor!

## PÉLDA:
## Első fejezet

Ez az első bekezdés.

## Második fejezet

• Első pont
• Második pont
• Harmadik pont

Végül a záró bekezdés.

A válasz végére mindig írd: "## Forrásjegyzék"`;
}

function guessLang(text) {
  const hunPattern = /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|nem|van|mit|hol|kérem|jegyzet|tantárgy|vizsga)\b/i;
  return hunPattern.test(text) ? "hu" : "en";
}

function cleanText(text, max = 30000) {
  return String(text || "")
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{5,}/g, "\n\n\n\n")
    .trim()
    .slice(0, max);
}

// ==============================================
// ✅ STREAM FELDOLGOZÁS — NE OLVADJANAK ÖSSZE A DARABOK
// ==============================================
async function* processGeminiStream(stream) {
  let elozoDarab = "";
  
  for await (const chunk of stream) {
    const nyersSzoveg = typeof chunk?.text === "function" ? chunk.text() : chunk?.text;
    if (!nyersSzoveg) continue;

    // Sortörések egységesítése
    const szoveg = nyersSzoveg
      .normalize("NFC")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // Ha listaelem jön, NE legyen előtte szóköz, új sorra kerüljön
    const javitott = szoveg
      .replace(/(\S)\s+(• |\d+\.\s)/g, "$1\n$2")
      .replace(/\n{4,}/g, "\n\n\n");

    elozoDarab = javitott;
    yield javitott;
  }
}

async function* processGroqStream(stream) {
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const sorok = buffer.split("\n");
    buffer = sorok.pop() || "";

    for (const sor of sorok) {
      const tiszta = sor.trim();
      if (!tiszta || !tiszta.startsWith("data:")) continue;
      const adat = tiszta.slice(5).trim();
      if (adat === "[DONE]") return;
      
      try {
        const json = JSON.parse(adat);
        const tartalom = json?.choices?.[0]?.delta?.content;
        if (tartalom) {
          yield tartalom
            .normalize("NFC")
            .replace(/\r\n/g, "\n")
            .replace(/\r/g, "\n")
            .replace(/(\S)\s+(• |\d+\.\s)/g, "$1\n$2");
        }
      } catch {}
    }
  }
}

async function fetchGroq(prompt, utasitas) {
  const kulcs = getEnv("GROQ_API_KEY");
  if (!kulcs) throw new Error("Nincs Groq API kulcs");

  const modell = getEnv("GROQ_MODEL") || "llama3-70b-8192";
  
  const valasz = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${kulcs}`
    },
    body: JSON.stringify({
      model: modell,
      stream: true,
      temperature: 0.4,
      max_tokens: 4096,
      messages: [
        { role: "system", content: utasitas },
        { role: "user", content: prompt }
      ]
    })
  });

  if (!valasz.ok) throw new Error(`Groq hiba: ${valasz.status}`);
  return valasz;
}

// ==============================================
// FŐ FÜGGVÉNY
// ==============================================
export async function kezelKerest(kérés, elozmenyek = [], jegyzetSzoveg = "") {
  if (!kérés?.trim()) throw new Error("Hiányzik a kérdés");

  const nyelv = guessLang(kérés);
  const utasitas = buildSystemInstruction();

  // Keresés a weben
  let webTalalat = "";
  try {
    const keresEredmeny = await Promise.race([
      webSearch(kérés.slice(0, 200), nyelv),
      new Promise(resolve => setTimeout(() => resolve(null), 4000))
    ]);
    if (keresEredmeny?.summary) {
      webTalalat = `${keresEredmeny.summary}\n\n(Forrás: ${keresEredmeny.source})`;
    }
  } catch (e) { console.error("Keresési hiba:", e); }

  // Összeállítjuk a beküldendő szöveget
  const elozmenySzoveg = elozmenyek
    .slice(-6)
    .map(t => `${t.felhasznalo ? "Felhasználó" : "AI"}: ${cleanText(t.szoveg, 2000)}`)
    .join("\n");

  const teljesKeres = [
    jegyzetSzoveg ? `## FELHASZNÁLT JEGYZET\n${jegyzetSzoveg}\n\n` : "",
    webTalalat ? `## KÜLSŐ FORRÁS\n${webTalalat}\n\n` : "",
    elozmenySzoveg ? `## ELŐZMÉNY\n${elozmenySzoveg}\n\n` : "",
    `## KÉRDÉS\n${kérés}`
  ].filter(Boolean).join("");

  // Futtatás — Gemini első, Groq tartalék
  try {
    if (hasGemini) {
      const stream = await geminiAi.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: teljesKeres }] }],
        config: { systemInstruction: utasitas, temperature: 0.4 }
      });
      return { stream: processGeminiStream(stream) };
    }
  } catch (e) {
    console.error("Gemini hiba, Groq próba:", e?.message);
  }

  if (hasGroq) {
    const valasz = await fetchGroq(teljesKeres, utasitas);
    return { stream: processGroqStream(valasz) };
  }

  throw new Error("Egyik AI szolgáltatás sem elérhető");
}

// ==============================================
// ✅ KÜLSŐ FORMÁZÓ — A LETÖLTÉSHEZ IS HASZNÁLHATÓ
// ==============================================
export function veglegesFormazas(szoveg) {
  if (!szoveg) return "";
  
  return szoveg
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    
    // Felsorolások mindig új soron
    .replace(/(\S)\s+(• |\- |\* |\d+\.\s)/g, "$1\n$2")
    
    // Fejezetcímek elválasztása
    .replace(/(\S)\s*(#{1,6}\s)/g, "$1\n\n$2")
    .replace(/(#{1,6}\s.+?)(\S)/g, "$1\n\n$2")
    
    // Túl sok üres sor csökkentése
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}
