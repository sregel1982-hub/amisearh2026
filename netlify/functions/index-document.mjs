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

async function ocrWithGemini(buffer, mimeType = "image/png") {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { data: buffer.toString("base64"), mimeType } },
          { text: "Olvasd ki a képen/oldalon látható összes szöveget, képleteket is. Csak a nyers szöveget add vissza, kommentár nélkül." }
        ]
      }
    ]
  });
  return result.text || "";
}

async function extractText(buffer, pathOrName) {
  const ext = (pathOrName.split(".").pop() || "").toLowerCase();

  if (ext === "txt" || ext === "md" || ext === "csv") {
    return buffer.toString("utf8");
  }

  if (ext === "pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await parser.getText();
      await parser.destroy?.();
      const text = normalizeText(result?.text || "");
      if (text.length > 50) return text;
    } catch (e) {
      console.warn("pdf-parse failed, trying OCR:", e.message);
    }
    try {
      return await ocrWithGemini(buffer, "application/pdf");
    } catch (e) {
      console.warn("PDF OCR failed:", e.message);
      return "";
    }
  }

  if (ext === "docx") {
    const mammoth = (await import("mammoth")).default;
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value || "");
  }

  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return await ocrWithGemini(buffer, mime);
  }

  try {
    return await ocrWithGemini(buffer, "application/pdf");
  } catch {
    return "";
  }
}

export const handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const noteId = body.noteId;
    const filePath = body.fileName || body.filePath;

    if (!noteId || !filePath) throw new Error("Missing parameters (noteId, fileName)");

    const { data: fileData, error: dlErr } = await supabase.storage
      .from("jegyzetek")
      .download(filePath);

    if (dlErr || !fileData) throw new Error("File download failed: " + (dlErr?.message || "no data"));

    const buffer = Buffer.from(await fileData.arrayBuffer());
    let textContent = normalizeText(await extractText(buffer, filePath));

    if (textContent.length < 20) {
      throw new Error("Not enough text extracted");
    }

    const textHash = createHash("sha256").update(textContent).digest("hex");

    let embedding = null;
    try {
      const embedResult = await ai.models.embedContent({
        model: "text-embedding-004",
        contents: [{ parts: [{ text: textContent.substring(0, 8000) }] }]
      });
      embedding = embedResult.embeddings?.[0]?.values || null;
    } catch (e) {
      console.warn("Embedding generation failed:", e.message);
    }

    const { error: updErr } = await supabase
      .from("jegyzetek")
      .update({ text_content: textContent, text_hash: textHash, embedding })
      .eq("id", noteId);

    if (updErr) throw new Error("DB update failed: " + updErr.message);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, length: textContent.length, embedded: !!embedding })
    };
  } catch (err) {
    console.error("Index document error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message })
    };
  }
};
    
