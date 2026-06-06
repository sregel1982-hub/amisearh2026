import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  if (!isAiConfigured()) {
    return aiUnavailableResponse();
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  const { query, notes, lang = "hu" } = body;

  if (!query || typeof query !== "string") {
    return jsonError("Query is required", 400, "missing_query");
  }

  let notesContext = (notes && typeof notes === "string") ? notes.substring(0, 100000) : "";

  if (!notesContext) {
    try {
      const { data: allNotes } = await supabase
        .from("jegyzetek")
        .select("cim, original_name, text_content")
        .eq("user_id", user.id)
        .not("text_content", "is", null)
        .order("created_at", { ascending: false })
        .limit(3);

      if (allNotes && allNotes.length > 0) {
        notesContext = allNotes
          .map((n, i) => `=== Jegyzet ${i + 1}: ${n.cim || n.original_name || "ismeretlen"} ===\n${n.text_content}`)
          .join("\n\n")
          .substring(0, 100000);
      }
    } catch (e) {
      console.warn("notes context fetch failed:", e.message);
    }
  }

  const useGrounding = !notesContext;

  const baseInstruction =
    (lang === "hu"
      ? "Te egy segítőkész AI tanulási asszisztens vagy az AMISEARCH platformon. Válaszolj MAGYARUL, érthető, jól strukturált magyarázatokkal. "
      : "You are a helpful AI study assistant on the AMISEARCH platform. Answer clearly with well-structured explanations. ") +
    "Használhatsz LaTeX formulákat ($...$ vagy $$...$$). Listák, fejezetek és táblázatok markdown-nal. " +
    "Ha a felhasználó gondolattérképet kér, készíts egyet Mermaid 'mindmap' szintaxissal (első sor 'mindmap', gyökér root((Téma)), 2 szóköz indent, MAX 3 szint). ";

  const notesInstruction = notesContext
    ? "A felhasználónak vannak FELTÖLTÖTT JEGYZETEI (lásd lent). Elsősorban ezekből válaszolj, hivatkozz konkrét részekre. Ha nincs benne válasz, egészítsd ki általános tudásoddal."
    : "Nincs feltöltött jegyzet — keress széles körben a témában és add meg a forrásokat a válasz végén (Források: szekció).";

  let promptText = query;
  if (notesContext) {
    promptText =
      "=== FELTÖLTÖTT JEGYZETEK ===\n" + notesContext +
      "\n=== JEGYZETEK VÉGE ===\n\nFelhasználó kérdése: " + query;
  }

  const contents = [{ role: "user", parts: [{ text: promptText }] }];

  try {
    const config = { systemInstruction: baseInstruction + notesInstruction };
    if (useGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config
    });

    return streamText(stream);
  } catch (error) {
    console.error("Search AI generation failed:", error);

    if (useGrounding) {
      try {
        const stream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents,
          config: { systemInstruction: baseInstruction + notesInstruction }
        });
        return streamText(stream);
      } catch (e) {
        console.error("Fallback also failed:", e);
      }
    }

    return aiUnavailableResponse();
  }
}

export const config = {};
    
