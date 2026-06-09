import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

function normalizeText(t) {
  return (t || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextWithGemini(buffer, mimeType) {
  try {
    // Frissítve gemini-2.5-flash modellre az OCR képességek javításáért
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: buffer.toString("base64"), mimeType } },
          { text: "Olvasd ki a teljes szöveget a képről/dokumentumról. Csak a nyers szöveget add vissza, semmi magyarázat." }
        ]
      }]
    });
    return normalizeText(result.text || "");
  } catch (e) {
    console.warn("Gemini OCR failed:", e.message);
    return "";
  }
  
