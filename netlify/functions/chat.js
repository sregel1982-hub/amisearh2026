import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) => (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];
const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  console.log("✅ chat.js fut.");
  if (req.method !== "POST") return jsonError("Method not allowed", 405);
  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { message } = body;

  const systemInstruction = "Te egy segítőkész  AI tutor vagy. Válaszolj magyarul. A válaszod végén MINDIG készíts egy '=== FORRÁSOK ===' részt hiteles forrásokkal.";

  try {
    const config = { 
        systemInstruction,
        tools: [{ googleSearch: {} }] 
    };
    console.log("AI kérés küldése chat.js-ből.", config);
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config
    });
    return streamText(stream);
  } catch (error) {
    console.error("AI generálás hiba chat.js-ben:", error);
    return aiUnavailableResponse();
  }
}
