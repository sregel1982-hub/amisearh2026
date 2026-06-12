import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { latexToUnicode } from "./utils.js";

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
  return latexToUnicode(
    String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/[\t ]+/g, " ")
      .replace(/\n{4,}/g, "\n\n")
      .trim()
      .slice(0, max)
  );
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
      return jsonError("Unauthorized", 401, "unauthorized");
    }

    const body = await req.json().catch(() => ({}));
    const { query, notes, lang = "hu" } = body;

    if (!query || typeof query !== "string") {
      return jsonError("Query is required", 400, "missing_query");
    }

    let notesContext = "";
    if (notes && typeof notes === "string") {
      notesContext = cleanText(notes, 80000);
    } else {
      const supabase = getSupabaseAdmin();
      if (supabase) {
        try {
          const { data: allNotes } = await supabase
            .from("jegyzetek")
            .select("cim, original_name, text_content")
            .eq("user_id", user.id)
            .not("text_content", "is", null)
            .order("created_at", { ascending: false })
            .limit(4);

          if (allNotes?.length > 0) {
            notesContext = allNotes
              .map((note, index) => {
                const clean = cleanText(note.text_content || "", 18000);
                return `=== Jegyzet ${index + 1}: ${note.cim || note.original_name || "Névtelen"} ===\n${clean}`;
              })
              .join("\n\n");
          }
        } catch (error) {
          console.warn("Notes fetch failed:", error?.message || error);
        }
      }
    }

    const systemInstruction =
      lang === "hu"
        ? "Te egy kiváló magyar matematika és tanulási asszisztens vagy az AMISEARCH platformon. Ha van saját jegyzetkontekstus, elsősorban arra támaszkodj. Válaszolj érthetően, lépésről lépésre, nyers LaTeX kód helyett olvasható jelöléssel."
        : "You are an excellent educational assistant for AMISEARCH. If user notes are available, prioritize them. Answer clearly and step by step.";

    const prompt = `${notesContext ? `## Saját jegyzetek\n${notesContext}\n\n` : ""}## Felhasználó kérdése\n${query}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        temperature: 0.35,
      },
    });

    return streamText(stream);
  } catch (error) {
    console.error("AI Search error:", error?.message || error);
    return aiUnavailableResponse();
  }
}
