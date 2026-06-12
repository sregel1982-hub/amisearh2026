import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.js";
import { aiUnavailableResponse, isAiConfigured, jsonError } from "./ai-response.js";

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

function cleanText(value, max = 18000) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
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
    const { noteId, lang = "hu" } = body;

    if (!noteId) {
      return jsonError("noteId required", 400, "missing_noteId");
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return jsonError("Supabase server configuration missing", 500, "supabase_not_configured");
    }

    const { data, error } = await supabase
      .from("jegyzetek")
      .select("text_content, cim, original_name")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return jsonError("Note not found", 404, "note_not_found");
    }

    const content = cleanText(data.text_content, 22000);
    const title = data.cim || data.original_name || "Jegyzet";

    if (!content) {
      return jsonError("A jegyzetnek nincs kinyert szövege. Először feldolgozás vagy újraindexelés szükséges.", 400, "empty_content");
    }

    const prompt = `Készíts tanulásra alkalmas, jól strukturált összefoglalót a következő jegyzetből.\n\nCím: ${title}\nNyelv: ${lang === "hu" ? "magyar" : "angol"}\n\nElvárások:\n- legyen lényegre törő, de ne túl rövid;\n- emeld ki a kulcsfogalmakat;\n- adj vizsgára alkalmas pontokat;\n- ha vannak képletek, olvasható formában add meg őket;\n- a végén adj 5 ellenőrző kérdést.\n\nJegyzet szövege:\n${content}`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "Te az AMISEARCH magyar oktatási asszisztense vagy. A feltöltött jegyzet tartalmára támaszkodj, ne találj ki nem létező adatot.",
        temperature: 0.25,
      },
    });

    return new Response(
      JSON.stringify({
        summary: result.text || "",
        title,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }
    );
  } catch (error) {
    console.error("Summarize error:", error?.message || error);
    return aiUnavailableResponse();
  }
}

export const config = {};
