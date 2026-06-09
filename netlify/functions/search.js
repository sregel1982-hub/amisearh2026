import { getSupabaseUser } from "./auth-helper.mjs";  // ✅ .mjs!
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) => {
  const value = (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];
  if (!value) console.error(`Környezeti változó hiányzik: ${key}`);
  return value;
};

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  console.log("✅ search.js fut.");
  if (req.method !== "POST") return jsonError("Method not allowed", 405, "method_not_allowed");
  
  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401, "unauthorized");

  if (!isAiConfigured()) {
    console.error("AI nincs konfigurálva search.js-ben.");
    return aiUnavailableResponse();
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { query, lang = "hu" } = body;

  const baseInstruction = `Te egy kiváló magyar oktatási asszisztens vagy az AMISEARCH platformon.
Válaszolj érthetően, lépésről lépésre.
A válaszod végén MINDIG készíts egy elkülönített '=== FORRÁSOK ===' részt, ahol sorold fel a felhasznált hiteles forrásokat (tankönyvek, szakcikkek, weboldalak).`;

  const contents = [{ role: "user", parts: [{ text: query }] }];

  try {
    const config = {
      systemInstruction: baseInstruction,
      tools: [{ googleSearch: {} }]
    };
    console.log("AI kérés küldése search.js-ből.", config);
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents,
      config
    });
    return streamText(stream);
  } catch (error) {
    console.error("AI generálás hiba search.js-ben:", error);
    return aiUnavailableResponse();
  }
}
