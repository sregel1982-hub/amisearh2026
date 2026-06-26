import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { checkQuota, incrementUsage } from "./quota.js";

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

async function loadRelevantNotes(user, query, inlineNotes = "") {
  const parts = [];
  const inline = cleanText(inlineNotes, 25000);
  if (inline) parts.push(`=== Most megadott/feltöltött jegyzet ===\n${inline}`);

  const supabase = getSupabaseAdmin();
  if (!supabase || !user?.id) return parts.join("\n\n");

  try {
    const words = cleanText(query, 300).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3).slice(0, 8);
    const { data, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, original_name, tantargy, text_content, created_at")
      .eq("user_id", user.id)
      .not("text_content", "is", null)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      console.warn("Jegyzetek keresése sikertelen:", error.message);
      return parts.join("\n\n");
    }

    const scored = (data || []).map((note) => {
      const haystack = `${note.cim || ""} ${note.tantargy || ""} ${note.original_name || ""} ${note.text_content || ""}`.toLowerCase();
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? 1 : 0), 0);
      return { note, score };
    }).sort((a, b) => b.score - a.score).slice(0, 4);

    for (const { note } of scored) {
      const text = cleanText(note.text_content, 16000);
      if (!text) continue;
      const title = note.cim || note.original_name || `Jegyzet #${note.id}`;
      parts.push(`=== Saját jegyzet: ${title}${note.tantargy ? " — " + note.tantargy : ""} ===\n${text}`);
    }
  } catch (error) {
    console.warn("Jegyzetkontekstus hiba:", error?.message || error);
  }

  return parts.join("\n\n");
}

function instruction(lang = "hu") {
  if (lang !== "en") {
    return `Te az AMISEARCH dokumentumkereső és oktatási AI asszisztense vagy. Magyarul válaszolj.
- Ne kezdj "Rendben", "Persze", "Segítek" vagy hasonló felvezetéssel.
- Ha van saját jegyzetkontekstus, abból indulj ki, és külön említsd meg, melyik jegyzethez kapcsolódik.
- Adj rövid, pontos, tanulásra használható választ.
- A válasz végén mindig szerepeljen "## Forrásjegyzék" 3-6 megbízható forrással. A feltöltött jegyzetet forrásként jelöld meg, ha használtad.`;
  }
  return `You are AMISEARCH document search and educational AI. Answer directly, use uploaded notes first, and always end with "## References" listing reliable sources.`;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("A kereséshez vagy AI chathez jelentkezz be újra.", 401, "unauthorized");
    if (!isAiConfigured()) return aiUnavailableResponse();

    // --- KVÓTA ELLENŐRZÉS ---
    const quota = await checkQuota(user.id, "ai_questions");
    if (!quota.allowed) {
      return new Response(
        JSON.stringify({
          error: quota.message || "Lejárt a havi AI kérdés kereted. Válts Pro-ra a folytatáshoz!",
          code: "quota_exceeded",
          field: "ai_questions"
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const query = cleanText(body.query || body.message || "", 8000);
    const lang = body.lang === "en" ? "en" : "hu";
    if (!query) return jsonError("Hiányzó keresőkifejezés.", 400, "missing_query");

    // Kvóta növelése
    await incrementUsage(user.id, "ai_questions");

    const notesContext = await loadRelevantNotes(user, query, body.notes || "");
    const prompt = `${instruction(lang)}\n\n${notesContext ? "## Saját jegyzetekből kinyert kontextus\n" + notesContext + "\n\n" : ""}## Kérdés / keresés\n${query}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.25,
        tools: [{ googleSearch: {} }]
      }
    });
    return streamText(stream);
  } catch (error) {
    console.error("AI keresés hiba:", error);
    return aiUnavailableResponse();
  }
}
