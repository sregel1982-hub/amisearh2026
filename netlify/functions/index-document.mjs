import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fileTypeFromBuffer } from "file-type";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
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
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: buffer.toString("base64"), mimeType } },
        { text: "Olvasd ki a képen látható szöveget és képleteket. Csak a nyers szöveget add vissza." }
      ]
    }]
  });
  return result.response.text();
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
    } catch {}
    return await ocrWithGemini(buffer, "application/pdf");
  }
  if (ext === "pptx") return await ocrWithGemini(buffer, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  if (["jpg", "jpeg"].includes(ext)) return await ocrWithGemini(buffer, "image/jpeg");
  if (ext === "png") return await ocrWithGemini(buffer, "image/png");
  return await ocrWithGemini(buffer);
}

export const handler = async (event) => {
  try {
    const { noteId, filePath } = JSON.parse(event.body);
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

    if (!textContent || textContent.length < 10) {
      return { statusCode: 400, body: JSON.stringify({ error: "No extractable text found" }) };
    }

    textContent = normalizeText(textContent);
    const textHash = hashText(textContent);

    const embeddingResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: textContent }] }
        })
      }
    );

    const embeddingJson = await embeddingResponse.json();
    const embedding = embeddingJson?.embedding?.values;

    if (!embedding) {
      return { statusCode: 500, body: JSON.stringify({ error: "Embedding failed", detail: embeddingJson }) };
    }

    const { error: updateErr } = await supabase
      .from("jegyzetek")
      .update({ text_content: textContent, text_hash: textHash, embedding })
      .eq("id", noteId);

    if (updateErr) {
      return { statusCode: 500, body: JSON.stringify({ error: "DB update failed: " + updateErr.message }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
