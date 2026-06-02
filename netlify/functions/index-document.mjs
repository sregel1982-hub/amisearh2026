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
    } catch (e) {}

    return await ocrWithGemini(buffer);
  }

  // PPTX → OCR fallback
  if (ext === "pptx") {
    return await ocrWithGemini(buffer);
  }

  // Képek → OCR
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    return await ocrWithGemini(buffer);
  }

  // Minden más → OCR fallback
  return await ocrWithGemini(buffer);
}

// Main handler
export const handler = async (event) => {
  try {
    const user = await getSupabaseUser(event);
    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Not authenticated" })
      };
    }

    const { noteId, filePath } = JSON.parse(event.body);

    if (!noteId || !filePath) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing noteId or filePath" })
      };
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notes")
      .download(filePath);

    if (downloadError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to download file" })
      };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // Extract text
    const textContent = (await extractText(buffer, filePath)).trim();

    if (!textContent || textContent.length < 10) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No extractable text found" })
      };
    }

    // Hash
    const textHash = hashText(textContent);

    // Embedding
    const embeddingResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedText?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textContent })
      }
    );

    const embeddingJson = await embeddingResponse.json();

    if (!embeddingJson.embedding) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Embedding generation failed" })
      };
    }

    const embedding = embeddingJson.embedding.values;

    // Save to DB
    await db
      .update(uploadedNotes)
      .set({
        text_content: textContent,
        text_hash: textHash,
        embedding
      })
      .where(eq(uploadedNotes.id, noteId));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Document indexed successfully"
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
