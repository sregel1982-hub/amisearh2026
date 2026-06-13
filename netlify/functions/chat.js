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
    auth: { persistSession: false, autoRefreshToken: false },
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
  const huMarkers = ["á", "é", "í", "ó", "ö", "ő", "ú", "ü", "ű", "hogy", "mert", "szerint", "magyarázd", "feladat", "rajzold", "ábra", "halmaz"];
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

  // 1. INLINE DOKSI: + gombbal feltöltött fájl szövege
  const inline = cleanText(inlineNotes, 25000);
  if (inline) {
    parts.push(`=== A felhasználó által MOST feltöltött dokumentum ===\n${inline}\nFONTOS: Ezt a dokumentumot használd elsődlegesen a válaszhoz és diagram készítéshez!`);
  }

  // 2. DB-BŐL JÖVŐ JEGYZETEK
  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, processed, created_at")
      .eq("user_id", user.id)
      .eq("processed", true)
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
            score: simpleScore(`\( {note.cim || ""}\n \){note.original_name || ""}\n\( {note.tantargy || ""}\n \){note.text_content || ""}`, query),
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
        parts.push(`=== Mentett jegyzet: \( {title} \){subject} ===\n${text}`);
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
Reglas: No empieces con "Claro". Si hay apuntes, úsalos primero. Usa títulos, listas y tablas markdown. Termina con "## Fuentes" y enumera 3-6 fuentes.`;
  }
  if (lang === "en") {
    return `You are the AMISEARCH educational assistant. Answer directly, clearly and accurately in English.
Rules: Do not start with "Sure". If the user has notes, use them first. Use headings, lists and markdown tables. End with "## References" and list 3-6 sources.`;
  }
  return `Te az AMISEARCH oktatási asszisztense vagy. Magyarul válaszolj, közérthetően, pontosan.
Fontos szabályok:
- Ne kezdj felvezetővel: "Rendben", "Persze", "Segítek".
- Ha van feltöltött jegyzet vagy dokumentum, ELŐSZÖR ABBÓL DOLGOZZ, és jelezd: "A feltöltött dokumentum alapján..."
- Használj tagolt választ: címek, rövid bekezdések, felsorolások.
- Táblázatot markdown formában adj: | Oszlop |.
- A válasz végén mindig legyen "## Forrásjegyzék" szakasz 3-6 forrással.`;
}

function buildPrompt({ message, notesContext, history }) {
  const historyText = history
    .map((item) => `${item.role === "assistant" ? "AI" : "Felhasználó"}: ${cleanText(item.content, 2500)}`)
    .filter(Boolean)
    .join("\n");
  return `\( {notesContext ? `## Elérhető dokumentum/jegyzet kontextus\n \){notesContext}\n\n` : ""}\( {historyText ? `## Rövid beszélgetési előzmény\n \){historyText}\n\n` : ""}## Felhasználói kérés\n${message}`;
}

async function handleChartRequest(user, question, notesContext) {
  const chartKeywords = [
    "rajzold", "ábrázold", "grafikon", "diagram", "chart", "függvény", "plot",
    "oszlop", "kördiagram", "sin", "cos", "x^2", "ábra", "alakzat",
    "háromszög", "négyzet", "kör", "geometria", "derékszög",
    "természetes szám", "számhalmaz", "venn", "halmaz", "adatok", "statisztika", "éghajlat"
  ];

  const needsChartCheck = chartKeywords.some(k => question.toLowerCase().includes(k));
  if (!needsChartCheck) {
    return null;
  }

  const prompt = `
Felhasználói kérés: ${question}

Feltöltött dokumentum/jegyzet tartalma:
${notesContext || "Nincs feltöltött dokumentum."}

Feladat: Generálj Chart.js konfigot a DOKUMENTUM ADATAI ALAPJÁN. NE magyarázz, NE írj szöveget, CSAK JSON-t adj vissza.

Szabályok:
1. Ha a dokumentumban TÁBLÁZAT vagy SZÁMOK vannak: abból csinálj bar/line/pie chartot.
2. "természetes számok", "számhalmaz", "venn", "halmaz" → pie chart.
3. "függvény", "sin", "cos", "x^2" → line chart.
4. "háromszög", "geometria" → scatter chart.
5. Ha nem egyértelmű: pie chart.

JSON formátum:
{
  "chartConfig": { ... },
  "explanation": "Rövid magyarázat..."
}

FONTOS: Ha van dokumentum, akkor ABBÓL vedd az adatokat.
`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { temperature: 0.1 }
    });

    let text = result.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("JSON parse hiba:", text.slice(0, 300));
      parsed = {
        chartConfig: { type: "pie", data: { labels: ["Adat"], datasets: [{ data: [100] }] }, options: {} },
        explanation: "Alap diagram a kérésedhez."
      };
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("charts")
      .insert({
        user_id: user.id,
        question: question,
        config: parsed.chartConfig,
        explanation: parsed.explanation || ""
      })
      .select()
      .single();

    if (error) {
      console.error("Chart DB insert error:", error);
      return null;
    }

    const chartUrl = `/chart.html?id=${data.id}`;

    const linkHtml = `
${parsed.explanation || 'Elkészítettem a diagramot.'}

📊 <strong><a href="${chartUrl}" target="_blank" rel="noopener noreferrer">🔗 Diagram megnyitása új lapon</a></strong>
    `.trim();

    return {
      type: "chart_link",
      answer: linkHtml,
      url: chartUrl
    };

  } catch (error) {
    console.error("Chart request error:", error);
    return null;
  }
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

    // Jegyzetek betöltése
    const notesContext = await loadUserNotesContext(user, message, body.notes || "");

    // Diagram kezelés
    const chartResult = await handleChartRequest(user, message, notesContext);
    if (chartResult) {
      return new Response(JSON.stringify(chartResult), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Normál chat
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
