import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// === SEGÉDFUNKCIÓK ===
function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function jsonError(message, status = 500, code = "error") {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function aiUnavailableResponse() {
  return jsonError("Az AI szolgáltatás jelenleg nem elérhető.", 503, "ai_unavailable");
}

function isAiConfigured() {
  return !!getEnv("GEMINI_API_KEY");
}

// === NYELVDETEKTÁLÁS ===
function detectLanguage(text = "") {
  const sample = String(text || "").toLowerCase();
  const huMarkers = ["á","é","í","ó","ö","ő","ú","ü","ű","hogy","mert","szerint","magyarázd","feladat","rajzold","ábra","halmaz","diagram","táblázat","négyzet","háromszög","kör"];
  const esMarkers = ["¿","¡","ñ","qué","cómo","porque","explica","ejercicio","diagrama","tabla"];
  const deMarkers = ["ä","ö","ü","ß","wie","was","weil","aufgabe","diagramm","tabelle"];
  const frMarkers = ["à","è","é","ê","ë","ï","î","ô","ù","û","ç","comment","pourquoi","exercice","diagramme","tableau"];
  
  if (esMarkers.some((m) => sample.includes(m))) return "es";
  if (deMarkers.some((m) => sample.includes(m))) return "de";
  if (frMarkers.some((m) => sample.includes(m))) return "fr";
  if (huMarkers.some((m) => sample.includes(m))) return "hu";
  return "en";
}

// === FÁJL LETÖLTÉS SUPABASE STORAGE-BÓL ===
async function downloadFileAsBase64(supabase, filePath, bucket = "jegyzetek") {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) {
      console.warn("Storage download hiba:", error?.message);
      return null;
    }
    
    const arrayBuffer = await data.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    
    let mimeType = "application/octet-stream";
    if (filePath.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (filePath.endsWith('.png')) mimeType = 'image/png';
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) mimeType = 'image/jpeg';
    
    return { base64, mimeType };
  } catch (err) {
    console.error("Fájl letöltési hiba:", err);
    return null;
  }
}

// === JEGYZETEK BETÖLTÉSE (szöveg + kép) ===
async function loadUserNotesContext(user, query, inlineNotes = "") {
  const parts = [];
  const images = [];

  // Inline doksik (PDF/Word/TXT)
  const inline = cleanText(inlineNotes, 30000);
  if (inline) {
    parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inline}\n\nFONTOS: Használd ezt elsődlegesen!`);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return { text: parts.join("\n\n"), images };

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, processed, file_path, created_at")
      .eq("user_id", user.id)
      .eq("processed", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.warn("Jegyzetek betöltése sikertelen:", error.message);
    } else if (Array.isArray(data)) {
      for (const note of data) {
        const text = cleanText(note.text_content, 20000);
        const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
        
        if (text && text.length > 50) {
          parts.push(`=== Mentett jegyzet: ${title} ===\n${text}`);
        } else if (note.file_path) {
          console.log(`Kép/PDF letöltése: ${title}`);
          const fileData = await downloadFileAsBase64(supabase, note.file_path);
          if (fileData) {
            images.push({ title, base64: fileData.base64, mimeType: fileData.mimeType });
            parts.push(`=== Mentett jegyzet (kép): ${title} ===\n[A dokumentum képként lett feltöltve. Elemezd a képet.]`);
          }
        }
      }
    }
  } catch (error) {
    console.warn("Jegyzetkontekstus hiba:", error?.message || error);
  }

  return { text: parts.join("\n\n"), images };
}

// === RENDSZERUTASÍTÁS ===
function buildSystemInstruction(lang = "hu") {
  const instructions = {
    hu: `Te az AMISEARCH oktatási asszisztense vagy. Magyarul válaszolj, közérthetően, pontosan.

Fontos szabályok:
- Ha van feltöltött dokumentum, ELŐSZÖR ABBÓL DOLGOZZ.
- Ne kezdj felesleges felvezetéssel (pl. "Rendben", "Persze").
- Használj felsorolásokat, táblázatokat ahol érdemes.
- Ismerd fel a neked feltöltött pdf,word,txt formátumot!

VIZUÁLIS FORMÁZÁS (kötelező, ha releváns):
- TÁBLÁZAT: markdown | Oszlop1 | Oszlop2 |
- DIAGRAM/ÁBRA: ASCII art (oszlopdiagram, folyamatábra)
- HÁROMSZÖG/NÉGYSZÖG: ASCII rajz
      /\\
     /  \\
    /____\\
- FOLYAMAT: számozott lépések
- A válasz végén legyen "## Forrásjegyzék" szakasz 3-6 forrással.`,
    
    es: `Eres el asistente educativo de AMISEARCH. Responde en español.

Reglas:
- Sin introducciones de cortesía.
- TABLAS: formato markdown | Columna1 | Columna2 |
- DIAGRAMAS: ASCII art
- Fuentes al final.`,
    
    de: `Du bist der AMISEARCH Bildungsassistent. Antworte auf Deutsch.

Regeln:
- Keine Höflichkeitsfloskeln.
- TABELLEN: Markdown-Format
- DIAGRAMME: ASCII-Art
- Quellen am Ende.`,
    
    fr: `Vous êtes l'assistant éducatif AMISEARCH. Répondez en français.

Règles:
- Pas d'introductions de courtoisie.
- TABLEAUX: format markdown
- DIAGRAMMES: ASCII art
- Sources à la fin.`,
    
    en: `You are the AMISEARCH educational assistant. Answer in English.

Rules:
- No filler openings.
- TABLES: markdown format | Column1 | Column2 |
- DIAGRAMS: ASCII art
- PROCESSES: numbered steps
- References at the end.`
  };
  
  return instructions[lang] || instructions["en"];
}

// === PROMPT ÉPÍTŐ ===
function buildPrompt({ message, notesContext, history }) {
  const historyText = history
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .filter(Boolean)
    .join("\n");

  return `${notesContext ? `## Dokumentumok/jegyzetek\n${notesContext}\n\n` : ""}${historyText ? `## Előzmények\n${historyText}\n\n` : ""}## Kérdés\n${message}`;
}

// === STREAM HELPER ===
async function* streamToGenerator(stream) {
  for await (const chunk of stream) {
    const text = chunk?.text || chunk?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (text) yield text;
  }
}

function streamResponse(generator) {
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("Stream hiba:", err);
        controller.error(err);
      }
    }
  });
  
  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// === FŐ HANDLER ===
export default async function handler(req) {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405, "method_not_allowed");
    }

    if (!isAiConfigured()) {
      return aiUnavailableResponse();
    }

    const user = await getSupabaseUser(req);
    if (!user) {
      return jsonError("Jelentkezz be!", 401, "unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    const rawMessage = body.message || body.query || "";
    const message = cleanText(rawMessage, 12000);

    if (!message) {
      return jsonError("Hiányzó üzenet.", 400, "missing_message");
    }

    // Nyelv detektálás
    const lang = body.lang && body.lang !== "auto" ? body.lang : detectLanguage(rawMessage);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    // Jegyzetek betöltése
    const notesResult = await loadUserNotesContext(user, message, body.notes || "");
    const notesContext = notesResult.text;
    const noteImages = notesResult.images;

    // Prompt összeállítása
    const promptText = buildPrompt({ message, notesContext, history });

    // Gemini contents (szöveg + képek)
    const parts = [{ text: promptText }];
    
    for (const img of noteImages.slice(0, 3)) {
      parts.push({
        inlineData: {
          mimeType: img.mimeType || "image/jpeg",
          data: img.base64
        }
      });
      console.log(`Kép hozzáadva: ${img.title}`);
    }

    // Gemini hívás
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts }],
      config: {
        temperature: 0.35,
        systemInstruction: buildSystemInstruction(lang),
      },
    });

    return streamResponse(streamToGenerator(stream));

  } catch (error) {
    console.error("Chat AI error:", error?.message || error);
    return aiUnavailableResponse();
  }
}
