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

export const handler = async (event) => {
  console.log("=== INDEX-DOCUMENT STARTED ===");
  
  try {
    const { noteId, filePath } = JSON.parse(event.body || "{}");
    console.log("Processing noteId:", noteId, "filePath:", filePath);

    if (!noteId || !filePath) {
      throw new Error("Missing noteId or filePath");
    }

    // Download file
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notes")
      .download(filePath);

    if (downloadError) throw new Error("Download failed: " + downloadError.message);

    const buffer = Buffer.from(await fileData.arrayBuffer());
    console.log("File downloaded, size:", buffer.length);

    // Extract text
    let textContent = await extractText(buffer, filePath);
    textContent = textContent.trim();

    console.log("Extracted text length:", textContent.length);

    if (textContent.length < 20) {
      throw new Error("Too little text extracted");
    }

    // Generate embedding
    console.log("Generating embedding...");
    const embedResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: textContent }] }]
    });

    const embedding = embedResult.embeddings?.[0]?.values;
    console.log("Embedding generated, length:", embedding?.length);

    if (!embedding || embedding.length < 100) {
      throw new Error("Invalid embedding");
    }

    // Update database
    const { error: updateErr } = await supabase
      .from("jegyzetek")
      .update({ 
        text_content: textContent.substring(0, 50000), 
        embedding 
      })
      .eq("id", noteId);

    if (updateErr) throw new Error("DB update failed: " + updateErr.message);

    console.log("=== SUCCESS: Note processed ===");
    return { statusCode: 200, body: JSON.stringify({ success: true }) };

  } catch (err) {
    console.error("=== INDEX-DOCUMENT ERROR ===", err.message);
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: err.message }) 
    };
  }
};

async function extractText(buffer, filePath) {
  // ... (ugyanaz, mint korábban, vagy ha kell, ide is beírhatom)
  // Egyelőre hagyd meg a régit, ha működött
  const type = await fileTypeFromBuffer(buffer);
  const ext = (type?.ext || filePath.split(".").pop()).toLowerCase();

  if (ext === "pdf") {
    try {
      const parsed = await pdfParse(buffer);
      if (parsed.text && parsed.text.length > 30) return parsed.text;
    } catch {}
  }
  // OCR fallback...
  return "Text extraction placeholder"; // ideiglenes
}




    
