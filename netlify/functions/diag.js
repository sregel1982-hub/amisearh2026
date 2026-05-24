// ⚠️ TEMPORARY DIAGNOSTIC FUNCTION — v2 — törölhető a hibakeresés után

import { GoogleGenAI } from "@google/genai";

function envGet(name) {
  if (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get) {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 12) return value.substring(0, 4) + "***";
  return value.substring(0, 8) + "..." + value.substring(value.length - 4);
}

export default async function handler(req) {
  const envCheck = {
    GEMINI_API_KEY: !!envGet("GEMINI_API_KEY"),
    GEMINI_API_KEY_PREFIX: maskValue(envGet("GEMINI_API_KEY")),
    SUPABASE_URL: envGet("SUPABASE_URL") || null,
    NODE_VERSION: process.version
  };

  // Gemini API teszt — több modellt is kipróbálunk
  const geminiKey = envGet("GEMINI_API_KEY");
  const geminiResults = {};

  if (!geminiKey) {
    geminiResults.error = "GEMINI_API_KEY nincs beállítva";
  } else {
    const models = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash"
    ];

    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      
      for (const model of models) {
        try {
          const resp = await ai.models.generateContent({
            model,
            contents: [{ role: "user", parts: [{ text: "Mondj egy szót magyarul." }] }]
          });
          const text = resp?.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || "(no text)";
          geminiResults[model] = { ok: true, response: text.substring(0, 100) };
        } catch (e) {
          geminiResults[model] = { 
            ok: false, 
            error: e.message?.substring(0, 300),
            status: e.status,
            code: e.code
          };
        }
      }
    } catch (e) {
      geminiResults.initError = e.message?.substring(0, 300);
    }
  }

  return new Response(
    JSON.stringify({ envCheck, geminiResults }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}

export const config = {};
