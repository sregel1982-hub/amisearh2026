// netlify/functions/index-document.mjs
import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { db } from "../../db/index.js";
import { jegyzetek } from "../../db/schema.js";   // ← ÁTÍRVA
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileTypeFromBuffer } from "file-type";

// Gemini init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Supabase init (service role)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hash helper
function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

// UTF‑8 normalizáló
function normalizeText(text) {
  return text
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Å‘/g, "ő")
    .replace(/Å±/g, "ű")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã¶/g, "ö")
    .replace(/Ã¼/g, "ü")
    .replace(/Ã/g, "Ñ")
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/â€ž/g, "„")
    .replace(/â€œ/g, "“")
    .replace(/â€/g, "”")
    .replace(/â€˜/g, "‘")
    .replace(/â€™/g, "’")
    .replace(/â€¢/g, "•")
    .replace(/â€¦/g, "…")
    .replace(/âˆ’/g, "−")
    .replace(/â‰¤/g, "≤")
    .replace(/â‰¥/g, "≥")
    .replace(/âˆ€/g, "∈")
    .replace(/âˆƒ/g, "∃")
    .replace(/âˆž/g, "∞")
    .replace(/âˆš/g, "√")
    .replace(/âˆ—/g, "∗")
    .replace(/âˆ©/g, "∩")
    .replace(/âˆª/g, "∪")
    .replace(/â‰ /g, "≠")
    .replace(/â‰ˆ/g, "≈")
    .replace(/âˆ¼/g, "∼")
    .replace(/Â/g, "");
}

// OCR with Gemini Vision
async function ocrWithGemini(buffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        data: buffer.toString("base64"),
       .generateContent([
    {
      inlineData: {
        data: buffer.toString("base64"),
        mimeType: "image/png"
      }
    },
    {
      text: "Olvasd ki a képen látható szöveget és képleteket. Csak a nyers szöveget add vissza."
    }
  ]);

  const response = await result.response
