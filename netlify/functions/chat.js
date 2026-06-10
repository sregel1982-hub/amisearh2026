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
