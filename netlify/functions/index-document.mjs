// netlify/functions/index-document.mjs
import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileTypeFromBuffer } from "file-type";

// Gemini init
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Supabase init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Hash helper
function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

// OCR with Gemini Vision
async function ocrWithGemini(buffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
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

  const response = await result.response;
  return response.text();
}

// Universal text extractor
async function extractText(buffer, filePath) {
  const type = await fileTypeFromBuffer(buffer);
  const ext = (type?.ext || filePath.split(".").pop()).toLowerCase();

  // TXT
  if (ext === "txt") {
    return buffer.toString("utf8");
  }

  // DOCX
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  // PDF → pdf-parse → ha üres → OCR
  if (ext === "pdf") {
    try {
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();

      if (text && text.length > 30) {
        return text;
      }
    } catch (e) {
      // megyünk OCR-re
    }

    // OCR fallback
    return await ocrWithGemini(buffer);
  }

  // PPTX → OCR fallback
  if (ext === "pptx") {
    return await ocrWithGemini(buffer);
  }

  // Képek → OCR
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return await ocrWithGemini(buffer
