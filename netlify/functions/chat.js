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

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function detectLanguage(text = "") {
  const sample = String(text || "").toLowerCase();
  const huMarkers = ["á", "é", "í", "ó", "ö", "ő", "ú", "ü", "ű", "hogy", "mert", "szerint", "magyarázd", "feladat"];
  const esMarkers = ["¿", "¡", "ñ", "qué", "cómo", "porque", "explica", "ejercicio"];

  if (esMarkers.some((marker) => sample.includes(marker))) return "es";
  if (huMarkers.some((marker) => sample.includes(marker))) return "hu";
  return "en";
}

function simpleScore(text, query) {
  const haystack = String(text || "").toLowerCase();
  const words = String(query || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4)
    .slice(0, 40);

  let score = 0;
  for (const word of words) {
    if (haystack.includes(word)) score += 1;
  }
  return score;
}

async function loadUserNotesContext(user, query, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 25000);

  if (inline) {
    parts.push(`=== A felhasználó által most megadott vagy feltöltött jegyzet ===\n${inline}`);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, processed, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) {
      console.warn("Jegyzetek betöltése sikertelen:", error.message);
      return parts.join("\n\n");
    }

    const ranked = Array.isArray(data)
      ? data
          .map((note) => ({
            note,
            score: simpleScore(`${note.cim || ""}\n${note.original_name || ""}\n${note.tantargy || ""}\n${note.text_content || ""}`, query),
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
      : [];

    for (const item of ranked) {
      const note = item.note;
      const text = cleanText(note.text_content, 18000);
      const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
      const subject = note.tantargy ? ` — ${note.tantargy}` : "";

      if (text) {
        parts.push(`=== Mentett jegyzet: ${title}${subject} ===\n${text}`);
      } else if (!note.processed) {
        parts.push(`=== Mentett jegyzet még feldolgozás alatt: ${title}${subject} ===\nA fájl fel van töltve, de a szövegkinyerés még nem fejeződött be. Ha a felhasználó erről kérdez, mondd el röviden, hogy újraindexelés vagy újbóli feltöltés szükséges lehet.`);
      }
    }
  } catch (error) {
    console.warn("Jegyzetkontekstus hiba:", error?.message || error);
  }

  return parts.join("\n\n");
}

function buildSystemInstruction(lang = "hu") {
  if (lang === "es") {
    return `Eres el asistente educativo de AMISEARCH. Responde en español de forma clara, precisa y útil.

Reglas importantes:
- No empieces con frases de relleno como "Claro" o "Te ayudo".
- Si hay apuntes subidos por el usuario, úsalos primero y dilo brevemente.
- Si los apuntes son incompletos, compleméntalos con conocimiento fiable sin inventar fuentes.
- Usa títulos, párrafos cortos, listas y tablas markdown cuando aporten claridad.
- Termina con "## Fuentes" y enumera 3-6 fuentes fiables.`;
  }

  if (lang === "en") {
    return `You are the AMISEARCH educational assistant. Answer directly, clearly and accurately in English.

Important rules:
- Do not start with filler phrases such as "Sure" or "I can help".
- If the user has uploaded notes, use those notes first and state this briefly.
- If the notes are incomplete, supplement them with reliable general knowledge without inventing sources.
- Use headings, short paragraphs, lists and markdown tables when useful.
- End with "## References" and list 3-6 trustworthy sources.`;
  }

  return `Te az AMISEARCH oktatási asszisztense vagy. Magyarul válaszolj, közérthetően, pontosan és tanulást segítő módon.

Fontos szabályok:
- Ne kezdj udvariassági felvezetővel, például: "Rendben", "Persze", "Segítek".
- Ha a felhasználó feltöltött jegyzetet, először abból dolgozz, és jelezd röviden, ha a jegyzetre támaszkodsz.
- Ha a jegyzet hiányos, egészítsd ki megbízható, általánosan elfogadott tudással, de ne találj ki nem létező forrást.
- Használj jól tagolt választ: címek, rövid bekezdések, felsorolások, képleteknél olvasható jelölés.
- Táblázatot markdown formában adj: | Oszlop | Oszlop |.
- A válasz végén mindig legyen "## Forrásjegyzék" szakasz 3-6 megbízható forrással. Ha csak saját jegyzetből dolgoztál, az első forrás legyen: "A feltöltött saját jegyzet".`;
}

function buildPrompt({ message, notesContext, history }) {
  const historyText = history
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .filter(Boolean)
    .join("\n");

  return `${notesContext ? `## Elérhető saját jegyzetkontekstus\n${notesContext}\n\n` : ""}${historyText ? `## Rövid beszélgetési előzmény\n${historyText}\n\n` : ""}## Felhasználói kérés\n${message}`;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405, "method_not_allowed");
    }

    if (!isAiConfigured()) {
      return aiUnavailableResponse();
    }

    const user = await getSupabaseUser(req);
    if (!user) {
      return jsonError("A kereséshez vagy AI chathez jelentkezz be újra.", 401, "unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) {
      return jsonError("Hiányzó üzenet.", 400, "missing_message");
    }

    const lang = body.lang && body.lang !== "auto" ? body.lang : detectLanguage(rawMessage);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    const notesContext = await loadUserNotesContext(user, message, body.notes || "");
    const prompt = buildPrompt({ message, notesContext, history });

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: buildSystemInstruction(lang),
        temperature: 0.35,
      },
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI error:", error?.message || error);
    return aiUnavailableResponse();
  }
}
