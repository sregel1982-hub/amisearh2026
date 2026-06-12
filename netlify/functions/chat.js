import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

async function loadUserNotesContext(user, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 25000);
  if (inline) parts.push(`=== A felhasználó által most feltöltött vagy megadott jegyzet ===\n${inline}`);

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, processed, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.warn("Jegyzetek betöltése sikertelen:", error.message);
    } else if (Array.isArray(data)) {
      for (const note of data) {
        const text = cleanText(note.text_content, 18000);
        const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
        if (text) {
          parts.push(`=== Mentett jegyzet: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\n${text}`);
        } else if (!note.processed) {
          parts.push(`=== Mentett jegyzet még feldolgozás alatt: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\nA fájl fel van töltve, de a szövegkinyerés még nem fejeződött be. Ha a felhasználó erről kérdez, jelezd röviden, hogy a jegyzet újraindexelése vagy újbóli feltöltése szükséges lehet.`);
        }
      }
    }
  } catch (error) {
    console.warn("Jegyzetkontekstus hiba:", error?.message || error);
  }

  return parts.join("\n\n");
}

function buildInstruction(lang = "hu") {
  if (lang !== "en") {
    return `Te az AMISEARCH oktatási asszisztense vagy. Magyarul válaszolj, közérthetően és pontosan.

Fontos stílus-szabályok:
- Ne kezdj udvariassági felvezetővel, például: "Rendben", "Persze", "Segítek", "Adok egy feladatot", "AmiSearch a feladat".
- Rögtön a lényegi magyarázattal, feladattal vagy válasszal kezdj.
- Ha a felhasználó jegyzetet töltött fel, először abból dolgozz. Jelezd röviden, ha a jegyzetben talált információra támaszkodsz.
- Ha a jegyzet hiányos, egészítsd ki megbízható, általánosan elfogadott tudással, de ne találj ki nem létező forrást.
- Tanulást segítő, jól tagolt választ adj: címek, rövid bekezdések, felsorolások, képleteknél olvasható jelölés.
- Speciális magyar karaktereket használj helyesen.
- A válasz végén mindig legyen "## Forrásjegyzék" szakasz. Ide 3-6 megbízható forrást írj: tankönyv, egyetemi/akadémiai oldal, Britannica, Khan Academy, OpenStax, PubMed/NCBI, NASA/NOAA vagy más szakmai forrás. Ha csak a felhasználó jegyzetét használtad, az első forrás legyen: "A feltöltött saját jegyzet".`;
  }
  return `You are the AMISEARCH educational assistant. Answer directly without filler openings such as "Sure" or "I can help". Use uploaded notes first when available, supplement with reliable knowledge when needed, and always end with a "## References" section listing 3-6 trustworthy sources. Do not invent sources.`;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("A kereséshez vagy AI chathez jelentkezz be újra.", 401, "unauthorized");
    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const message = cleanText(body.message || body.query || "", 12000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const lang = body.lang === "en" ? "en" : "hu";
    if (!message) return jsonError("Hiányzó üzenet.", 400, "missing_message");

    const notesContext = await loadUserNotesContext(user, body.notes || "");
    const historyText = history
      .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
      .filter(Boolean)
      .join("\n");

    const prompt = `${buildInstruction(lang)}\n\n${notesContext ? "## Elérhető jegyzetkontekstus\n" + notesContext + "\n\n" : ""}${historyText ? "## Rövid beszélgetési előzmény\n" + historyText + "\n\n" : ""}## Felhasználói kérés\n${message}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.35 }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI error:", error);
    return aiUnavailableResponse();
  }
}
// ============================================
// AMISEARCH AI TUTOR - chat.js (v1.0)
// Teljes funkcionalitás: memória, személyre szabás, 
// képfelismerés, diagram/táblázat generálás, nyelvfelismerés
// ============================================

import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key);
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

// ============================================
// ÚJ: Fájl letöltése Supabase Storage-ból base64-be
// ============================================
async function downloadFileAsBase64(supabase, filePath, bucket = "jegyzetek") {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) return null;
    
    const arrayBuffer = await data.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = data.type || "application/octet-stream";
    
    // MIME type detektálás fájlkiterjesztés alapján
    let detectedMime = mimeType;
    if (filePath.endsWith('.pdf')) detectedMime = 'application/pdf';
    else if (filePath.endsWith('.png')) detectedMime = 'image/png';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) detectedMime = 'image/jpeg';
    
    return { base64, mimeType: detectedMime };
  } catch (err) {
    console.error("Fájl letöltési hiba:", err);
    return null;
  }
}

// ============================================
// ÚJ: Felhasználói profil betöltése/módosítása
// ============================================
async function getOrCreateUserProfile(supabase, userId) {
  try {
    // Meglévő profil lekérdezése
    const { data, error } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("user_id", userId)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.warn("Profil lekérdezési hiba:", error.message);
    }
    
    if (data) return data;
    
    // Új profil létrehozása (üres, első chatnél fogjuk kitölteni)
    const { data: newProfile, error: insertError } = await supabase
      .from("user_profiles")
      .insert([{ user_id: userId, created_at: new Date().toISOString() }])
      .select()
      .single();
    
    if (insertError) {
      console.warn("Profil létrehozási hiba:", insertError.message);
      return null;
    }
    
    return newProfile;
  } catch (err) {
    console.error("Profil hiba:", err);
    return null;
  }
}

// ============================================
// ÚJ: Profil frissítése (ha a user válaszol a kérdésekre)
// ============================================
async function updateUserProfile(supabase, userId, updates) {
  try {
    const { error } = await supabase
      .from("user_profiles")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    
    if (error) console.warn("Profil frissítési hiba:", error.message);
  } catch (err) {
    console.error("Profil update hiba:", err);
  }
}

// ============================================
// ÚJ: Nyelv detektálása
// ============================================
function detectLanguage(text) {
  // Egyszerű nyelvdetektálás karakterek alapján
  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(text)) return "hu";
  if (/[ñÑáéíóúü¿¡]/.test(text)) return "es";
  if (/[äöüßÄÖÜẞ]/.test(text)) return "de";
  if (/[àèéêëïîôùûçÀÈÉÊËÏÎÔÙÛÇ]/.test(text)) return "fr";
  // Alapértelmezett: angol, hacsak nem magyar
  return "en";
}

// ============================================
// MÓDOSÍTOTT: Jegyzetek betöltése + képek
// ============================================
async function loadUserNotesContext(user, inlineNotes = "", supabase = null) {
  const parts = [];
  const images = [];
  
  const inline = cleanText(inlineNotes, 25000);
  if (inline) parts.push(`=== A felhasználó által most feltöltött vagy megadott jegyzet ===\n${inline}`);

  if (!supabase || !user?.id) return { text: parts.join("\n\n"), images };

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, processed, file_path, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.warn("Jegyzetek betöltése sikertelen:", error.message);
    } else if (Array.isArray(data)) {
      for (const note of data) {
        const text = cleanText(note.text_content, 18000);
        const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
        const hasRealText = text && text.length > 100;
        
        if (hasRealText) {
          parts.push(`=== Mentett jegyzet: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\n${text}`);
        } 
        else if (note.file_path) {
          console.log(`Szkennelt/képes jegyzet letöltése: ${title}`);
          const fileData = await downloadFileAsBase64(supabase, note.file_path);
          
          if (fileData) {
            images.push({ title, base64: fileData.base64, mimeType: fileData.mimeType });
            parts.push(`=== Mentett jegyzet (kép): ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\n[A jegyzet képként lett feltöltve. Az AI közvetlenül a képet fogja elemezni.]`);
          } else {
            parts.push(`=== Mentett jegyzet: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\nA fájl feltöltve, de nem sikerült betölteni.`);
          }
        }
        else if (!note.processed) {
          parts.push(`=== Mentett jegyzet feldolgozás alatt: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\nA feldolgozás még nem fejeződött be.`);
        }
      }
    }
  } catch (error) {
    console.warn("Jegyzetkontekstus hiba:", error?.message || error);
  }

  return { text: parts.join("\n\n"), images };
}

// ============================================
// MÓDOSÍTOTT: Rendszerutasítás nyelv + személyre szabás alapján
// ============================================
function buildInstruction(lang = "hu", profile = null, isFirstChat = false) {
  const detectedLang = lang || "hu";
  
  // Profil alapján személyre szabott rész
  let personalization = "";
  if (profile) {
    const parts = [];
    if (profile.education_level) parts.push(`Tanulmányi szint: ${profile.education_level}`);
    if (profile.hobbies) parts.push(`Hobbik/érdeklődés: ${profile.hobbies}`);
    if (profile.difficult_subjects) parts.push(`Nehéz tárgyak: ${profile.difficult_subjects}`);
    if (profile.learning_goal) parts.push(`Cél: ${profile.learning_goal}`);
    
    if (parts.length > 0) {
      personalization = `\n\n=== FELHASZNÁLÓ PROFILJA ===\n${parts.join("\n")}\nHasználj példákat a felhasználó érdeklődési köréből (pl. ha focizik, fizikánál használj labdarúgás-példákat). Fókuszálj a nehezebb tárgyakra részletesebben.\n`;
    }
  }

  if (detectedLang === "hu") {
    return `Te az AMISEARCH oktatási asszisztense vagy. Magyarul válaszolj, közérthetően és pontosan.${personalization}

Fontos stílus-szabályok:
- Ne kezdj udvariassági felvezetővel, például: "Rendben", "Persze", "Segítek".
- Rögtön a lényegi magyarázattal, feladattal vagy válasszal kezdj.
- Ha a felhasználó jegyzetet töltött fel, először abból dolgozz.
- Ha a jegyzet hiányos, egészítsd ki megbízható tudással, de ne találj ki forrást.
- Tanulást segítő, jól tagolt választ adj: címek, rövid bekezdések, felsorolások.
- Speciális magyar karaktereket használj helyesen.

VIZUÁLIS FORMÁZÁS (kötelező, ha releváns):
- TÁBLÁZATOK: Mindig markdown formátumot használj:
  | Oszlop1 | Oszlop2 | Oszlop3 |
  |---------|---------|---------|
  | adat1   | adat2   | adat3   |
- DIAGRAMOK/ÁBRÁK: ASCII art formátumban rajzolj:
  Példa oszlopdiagramra:
  Matek   ████████░░  80%
  Fizika  ██████░░░░  60%
  Kémia   █████████░  90%
- HÁROMSZÖG/GEOMETRIA: ASCII rajz:
      /\\
     /  \\
    /____\\
    A    B
- FOLYAMATOK: Számozott lépések vagy felsorolás.

A válasz végén mindig legyen "## Forrásjegyzék" szakasz 3-6 megbízható forrással.`;
  }
  
  if (detectedLang === "es") {
    return `Eres el asistente educativo de AMISEARCH. Responde en español de forma clara y precisa.${personalization}

Reglas de estilo:
- Sin introducciones de cortesía como "Vale", "Claro", "Te ayudo".
- Ve directo a la explicación, ejercicio o respuesta.
- Si el usuario subió apuntes, trabaja primero con ellos.
- Respuesta bien estructurada: títulos, párrafos cortos, listas.

FORMATEO VISUAL:
- TABLAS: Formato markdown | Columna1 | Columna2 |
- DIAGRAMAS: ASCII art
- PROCESOS: Pasos numerados

Incluye "## Fuentes" al final con 3-6 fuentes confiables.`;
  }

  // Alapértelmezett: angol
  return `You are the AMISEARCH educational assistant. Answer clearly and precisely in English.${personalization}

Style rules:
- No filler openings like "Sure", "I can help", "Here is".
- Go straight to the explanation, exercise, or answer.
- If the user uploaded notes, work from those first.
- Well-structured response: headings, short paragraphs, bullet points.

VISUAL FORMATTING:
- TABLES: Markdown format | Column1 | Column2 |
- DIAGRAMS: ASCII art
- PROCESSES: Numbered steps

Always end with "## References" listing 3-6 trustworthy sources.`;
}

// ============================================
// ÚJ: Első chat ellenőrzése (profil kérdések)
// ============================================
function shouldAskProfileQuestions(profile) {
  if (!profile) return true;
  // Ha nincs kitöltve a profil, kérdezzünk
  return !profile.education_level || !profile.hobbies;
}

// ============================================
// FŐ HANDLER
// ============================================
export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("A kereséshez vagy AI chathez jelentkezz be újra.", 401, "unauthorized");
    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    
    // Nyelv detektálás (body.lang vagy automatikus)
    let lang = body.lang;
    if (!lang || lang === "auto") {
      lang = detectLanguage(rawMessage);
    }
    
    if (!message) return jsonError("Hiányzó üzenet.", 400, "missing_message");

    const supabase = getSupabaseAdmin();
    
    // === ÚJ: Profil betöltés ===
    const profile = await getOrCreateUserProfile(supabase, user.id);
    
    // === ÚJ: Profil frissítés (ha a válasz tartalmaz profil adatokat) ===
    if (body.profileUpdate && profile) {
      await updateUserProfile(supabase, user.id, body.profileUpdate);
    }

    // === ÚJ: Első chat - profil kérdések ===
    if (shouldAskProfileQuestions(profile) && !body.skipProfileQuestions) {
      const questions = {
        hu: `👋 Szia! Örülök, hogy itt vagy! Hogy még jobban tudjak segíteni, kérlek válaszolj pár kérdésre:

1. **Milyen szinten tanulsz?** (pl. középiskola 11. évfolyam, egyetem 2. éves)
2. **Mik a hobbijaid vagy érdeklődési köreid?** (pl. foci, zene, gaming, kertészkedés)
3. **Melyik tárgyak mennek nehezebben?** (pl. matek, fizika, kémia)
4. **Mi a célod?** (pl. érettségi, ZH, vizsga, felvételi)

Ezek alapján személyre szabott példákat és magyarázatokat tudok adni!`,
        es: `👋 ¡Hola! Para ayudarte mejor, responde algunas preguntas:

1. ¿En qué nivel estudias?
2. ¿Cuáles son tus hobbies o intereses?
3. ¿Qué materias te cuestan más?
4. ¿Cuál es tu objetivo?`,
        en: `👋 Hi! To help you better, please answer a few questions:

1. What level are you studying at?
2. What are your hobbies or interests?
3. Which subjects do you find difficult?
4. What's your goal?`
      };
      
      const responseText = questions[lang] || questions["en"];
      
      // Stream helyett egyszerű válasz
      return new Response(responseText, {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // Jegyzetek betöltése
    const notesResult = await loadUserNotesContext(user, body.notes || "", supabase);
    const notesContext = notesResult.text;
    const noteImages = notesResult.images;

    // Előzmények formázása
    const historyText = history
      .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
      .filter(Boolean)
      .join("\n");

    // Prompt összeállítása
    const prompt = `${buildInstruction(lang, profile)}\n\n${notesContext ? "## Elérhető jegyzetkontekstus\n" + notesContext + "\n\n" : ""}${historyText ? "## Rövid beszélgetési előzmény\n" + historyText + "\n\n" : ""}## Felhasználói kérés\n${message}`;

    // === MÓDOSÍTOTT: Contents képekkel ===
    const parts = [{ text: prompt }];
    
    // Képek hozzáadása (max 3)
    for (const img of noteImages.slice(0, 3)) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.base64
        }
      });
      console.log(`Kép hozzáadva: ${img.title} (${img.base64.length} karakter)`);
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: parts }],
      config: { temperature: 0.35 }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI error:", error);
    return aiUnavailableResponse();
  }
}
