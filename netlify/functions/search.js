import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) => (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];
const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");
  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401, "unauthorized");

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { query, lang = "hu" } = body;

  const baseInstruction = ` Te egy kiváló magyar oktatási asszisztens vagy az AMISEARCH platformon. 
    Válaszolj érthetően, lépésről lépésre. 
    A válaszod végén MINDIG készíts egy elkülönített '=== FORRÁSOK ===' részt, ahol sorold fel a felhasznált hiteles forrásokat (tankönyvek, szakcikkek, weboldalak).`;

  const contents = [{ role: "user", parts: [{ text: query }] }];

  try {
    const config = { 
        systemInstruction: baseInstruction,
        tools: [{ googleSearch: {} }] // Bekapcsoljuk az internetes keresést a forrásokhoz
    };
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents,
      config
    });
    return streamText(stream);
  } catch (error) {
    return aiUnavailableResponse();
  }
}
