import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";
import { latexToUnicode } from "./utils.js";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get(key));

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return jsonError("Method not allowed", 405);
    }

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json().catch(() => ({}));
    const { query, notes, lang = "hu" } = body;

    if (!query || typeof query !== "string") {
      return jsonError("Query is required", 400);
    }

    // Jegyzetek összegyűjtése
    let notesContext = "";
    if (notes && typeof notes === "string") {
      notesContext = latexToUnicode(notes.substring(0, 80000));
    } else {
      try {
        const { data: allNotes } = await supabase
          .from("jegyzetek")
          .select("cim, text_content")
          .eq("user_id", user.id)
          .not("text_content", "is", null)
          .order("created_at", { ascending: false })
          .limit(2);

        if (allNotes?.length > 0) {
          notesContext = allNotes
            .map((n, i) => {
              const clean = latexToUnicode(n.text_content || "");
              return `=== Jegyzet ${i+1}: \( {n.cim || "Névtelen"} ===\n \){clean}`;
            })
            .join("\n\n");
        }
      } catch (e) {
        console.warn("Notes fetch failed:", e.message);
      }
    }

    const baseInstruction = 
      "Te egy kiváló magyar matematika és tanulási asszisztens vagy az AMISEARCH platformon. " +
      "Válaszolj mindig MAGYARUL, érthető, lépésről lépésre magyarázatokkal. " +
      "Soha ne használj nyersen LaTeX kódot, hacsak a felhasználó explicit nem kéri. " +
      "Használj unicode szimbólumokat ahol lehet (pl. √, ∑, ∞, ≥, ≤, ≠). " +
      "Legyél barátságos, motiváló és türelmes.";

    const fullPrompt = `${baseInstruction}\n\nFelhasználó kérdése: \( {query}\n\n \){notesContext ? `Kapcsolódó jegyzeteim:\n${notesContext}` : ""}`;

    return streamText(ai, fullPrompt);

  } catch (error) {
    console.error("AI Search error:", error);
    return jsonError("Internal server error", 500);
  }
}
