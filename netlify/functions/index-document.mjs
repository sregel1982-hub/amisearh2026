import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenAI } from "@google/genai";
import { fileTypeFromBuffer } from "file-type";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

// ... (a normalizeText, hashText, extractText, ocrWithGemini függvények maradhatnak ugyanazok)

export const handler = async (event) => {
  try {
    const { noteId, filePath } = JSON.parse(event.body || "{}");
    if (!noteId || !filePath) throw new Error("Missing parameters");

    const { data: fileData } = await supabase.storage.from("notes").download(filePath);
    const buffer = Buffer.from(await fileData.arrayBuffer());

    let textContent = await extractText(buffer, filePath);
    textContent = textContent.trim();

    if (textContent.length < 20) throw new Error("Not enough text extracted");

    const textHash = createHash("sha256").update(textContent).digest("hex");

    // Embedding generálás
    const embedResult = await ai.models.embedContent({
      model: "gemini-embedding-001",        // ← Javított modell
      contents: [{ parts: [{ text: textContent }] }]
    });

    const embedding = embedResult.embeddings?.[0]?.values;

    if (!embedding) throw new Error("Embedding generation failed");

    await supabase
      .from("jegyzetek")
      .update({ 
        text_content: textContent, 
        text_hash: textHash, 
        embedding 
      })
      .eq("id", noteId);

    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error("Index document error:", err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

// extractText és ocrWithGemini függvények ide (ugyanaz, mint korábban)
