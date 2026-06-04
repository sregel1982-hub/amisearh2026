import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
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

  const { message, history, notes, noteId } = body;

  if (!message || typeof message !== "string") {
    return jsonError("Message is required", 400, "missing_message");
  }

  // Ha noteId jön, betöltjük a szöveget az adatbázisból
  let notesContext = (notes && typeof notes === "string") ? notes.substring(0, 200000) : "";

  if (noteId && !notesContext) {
    const { data: noteRow } = await supabase
      .from("jegyzetek")
      .select("text_content, file_path")
      .eq("id", noteId)
      .single();

    if (noteRow?.text_content) {
      notesContext = noteRow.text_content.substring(0, 200000);
    }
  }

  // Ha nincs noteId se notes, betöltjük a felhasználó összes jegyzetét
  if (!notesContext) {
    const { data: allNotes } = await supabase
      .from("jegyzetek")
      .select("text_content, file_path")
      .eq("user_id", user.id)
      .not("text_content", "is", null)
      .order("created_at", { ascending: false })
      .limit(3);

    if (allNotes && allNotes.length > 0) {
      notesContext = allNotes
        .map((n, i) => `=== Jegyzet ${i + 1}: ${n.file_path?.split("/").pop() || "ismeretlen"} ===\n${n.text_content}`)
        .join("\n\n")
        .substring(0, 200000);
    }
  }

  // Internetes keresés Gemini grounding-gal
  const useGrounding = !notesContext; // Ha nincs saját jegyzet, interneten keres

  const contents = [];
  if (Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }]
        });
      }
    }
  }

  let promptText = message;
  if (notesContext) {
    promptText =
      "=== FELTÖLTÖTT JEGYZETEK ===\n" +
      notesContext +
      "\n=== JEGYZETEK VÉGE ===\n\n" +
      "Felhasználó kérdése: " + message;
  }

  contents.push({ role: "user", parts: [{ text: promptText }] });

  const baseInstruction =
    "Te egy segítőkész AI tutor vagy az AMISEARCH tanulási platformon, egyetemistáknak segítesz tanulni. " +
    "Válaszolj MAGYARUL, érthető magyarázatokkal. " +
    "Használhatsz LaTeX formulákat a $...$ vagy $$...$$ szintaxissal. " +
    "Listák, fejezetek és táblázatok markdown-nal. " +
    "Ha a felhasználó gondolattérképet kér, készíts egyet a Mermaid 'mindmap' szintaxissal " +
    "(első sor 'mindmap', gyökér root((Téma)), ágak 2 szóköz indent, MAX 3 szint). " +
    "Ha internetes forrásokból válaszolsz, a válasz VÉGÉN mindig adj meg egy 'Források:' szekciót " +
    "ahol felsorolod a hivatkozott weboldalakat, cikkeket, forrásokat markdown linkként.";

  const notesInstruction = notesContext
    ? " A felhasználó FELTÖLTÖTT JEGYZETE(KE)T (lásd '=== FELTÖLTÖTT JEGYZETEK ===' szekciót). " +
      "ELSŐSORBAN ezekből a jegyzetekből válaszolj. Hivatkozz konkrét részekre a megfelelő jegyzet nevével. " +
      "Ha a kérdésre a jegyzetekben nincs válasz, jelezd ezt, és egészítsd ki általános tudásoddal + internetes forrásokkal."
    : " Nincs feltöltött jegyzet — széles körben keress a témában interneten és tudásbázisodban. " +
      "Adj részletes, pontos választ, és a végén mindig sorolj fel forrásokat (Források: szekció).";

  try {
    const config = {
      systemInstruction: baseInstruction + notesInstruction
    };

    // Grounding bekapcsolása ha nincs saját jegyzet
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
    console.error("Chat AI generation failed:", error);

    // Ha a grounding hibát okoz, próbáljuk grounding nélkül
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
