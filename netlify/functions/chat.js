import { getSupabaseUser } from "./auth-helper.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get(key));

export default async function handler(req) {
  if (req.method !== "POST") return jsonError("Method not allowed", 405);
  
  const user = await getSupabaseUser(req);
  if (!user) return jsonError("Unauthorized", 401);

  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) return aiUnavailableResponse();

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { message } = body;

  const genAI = new GoogleGenerativeAI(apiKey);
  // A legstabilabb modellt használjuk
  const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "Te az Amisearch tanulási platform AI asszisztense vagy. Válaszolj magyarul, segítőkészen. A válaszod végén MINDIG sorold fel a forrásaidat '=== FORRÁSOK ===' címszó alatt, linkekkel vagy könyvcímekkel."
  });

  try {
    // Bekapcsoljuk a Google keresést a forrásokhoz
    const result = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: message }] }],
      tools: [{ googleSearch: {} }]
    });
    return streamText(result);
  } catch (error) {
    console.error("AI hiba:", error);
    return aiUnavailableResponse();
  }
}
