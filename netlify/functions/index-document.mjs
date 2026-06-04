import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";   // ← új, konzisztens library
import { fileTypeFromBuffer } from "file-type";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

function normalizeText(text) {
  return text
    .replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Å'/g, "ő")
    .replace(/Å±/g, "ű").replace(/Ã³/g, "ó").replace(/Ãº/g, "ú")
    .replace(/Ã¶/g, "ö").replace(/Ã¼/g, "ü").replace(/Â/g, "");
}

async function ocrWithGemini(buffer, mimeType = "image/png") {
  try {
    const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: buffer.toString("base64"), mimeType } },
          { text: "Olvasd ki a képen látható szöveget és képleteket. Csak a nyers szöveget add vissza, ne magyarázz." }
        ]
      }]
    });
    return result.response.text();
  } catch (e) {
    console.error("OCR failed:", e);
    return "";
  }
}

async function extractText(buffer, filePath) {
  const type = await fileTypeFromBuffer(buffer);
  const ext = (type?.ext || filePath.split(".").pop()).toLowerCase();

  if (ext === "txt") return buffer.toString("utf8");
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }
  if (ext === "pdf") {
    try {
      const parsed = await pdfParse(buffer);
      const text = (parsed.text || "").trim();
      if (text && text.length > 30) return text;
    } catch (e) { console.log("PDF parse failed, trying OCR") }
    return await ocrWithGemini(buffer, "application/pdf");
  }
  if (ext === "pptx") return await ocrWithGemini(buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  if (["jpg", "jpeg", "png"].includes(ext)) return await ocrWithGemini(buffer, `image/${ext}`);
  
  return await ocrWithGemini(buffer);
}

export const handler = async (event) => {
  try {
    const { noteId, filePath } = JSON.parse(event.body || "{}");
    if (!noteId || !filePath) {
      return { statusCode: 400, body: JSON.stringify({ error: "Missing noteId or filePath" }) };
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notes")
      .download(filePath);

    if (downloadError) {
      return { statusCode: 500, body: JSON.stringify({ error: "Download failed: " + downloadError.message }) };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let textContent = (await extractText(buffer, filePath)).trim();

    if (!textContent || textContent.length < 20) {
      return { statusCode: 400, body: JSON.stringify({ error: "No extractable text found" }) };
    }

    textContent = normalizeText(textContent);
    const textHash = hashText(textContent);

    // === Javított Embedding generálás ===
    const embedResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: textContent }] }]
    });

    const embedding = embedResult.embeddings?.[0]?.values;

    if (!embedding || embedding.length < 100) {
      return { statusCode: 500, body: JSON.stringify({ error: "Embedding generation failed" }) };
    }

    const { error: updateErr } = await supabase
      .from("jegyzetek")
      .update({ 
        text_content: textContent, 
        text_hash: textHash, 
        embedding 
      })
      .eq("id", noteId);

    if (updateErr) {
      console.error("DB update error:", updateErr);
      return { statusCode: 500, body: JSON.stringify({ error: "DB update failed" }) };
    }

    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true, textLength: textContent.length }) 
    };

  } catch (err) {
    console.error("Processing error:", err);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err.message }) 
    };
  }
};





    
