// netlify/functions/extractText.mjs
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFile } from "fs/promises";
import path from "path";
import { fileTypeFromBuffer } from "file-type";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function ocrWithGemini(imageBuffer) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/png",
      },
    },
    {
      text: "Olvasd ki a képen látható szöveget, képleteket is beleértve. Csak a nyers szöveget add vissza.",
    },
  ]);

  const response = await result.response;
  return response.text();
}

export async function extractTextFromFile(filePath) {
  const buffer = await readFile(filePath);
  const type = await fileTypeFromBuffer(buffer);
  const ext = (type?.ext || path.extname(filePath).replace(".", "")).toLowerCase();

  // 1) TXT – triviális
  if (ext === "txt") {
    return buffer.toString("utf8");
  }

  // 2) PDF – pdf-parse, ha üres → OCR
  if (ext === "pdf") {
    try {
      const pdfData = await pdfParse(buffer);
      const text = (pdfData.text || "").trim();

      if (text && text.length > 50) {
        return text;
      }
    } catch (e) {
      // megyünk tovább OCR-re
    }

    // OCR fallback – minden oldalt képként kezelni lenne az ideális,
    // de egyszerűsítve: teljes PDF → kép (ha van ilyen pipeline),
    // itt most feltételezzük, hogy már PNG-ként kapjuk.
    // Ha nincs saját konverziód, első körben elég, ha Puppeteer PDF-eket
    // már eleve PNG-ként is elmented, és azt adod át ide.
    const ocrText = await ocrWithGemini(buffer);
    return ocrText;
  }

  // 3) DOCX – mammoth
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  // 4) PPTX – nagyon egyszerű fallback: Gemini Vision OCR az oldalakról
  // (ha később akarsz rendes PPTX-parsert, azt külön hozzá tudjuk adni)
  if (ext === "pptx") {
    const ocrText = await ocrWithGemini(buffer);
    return ocrText;
  }

  // 5) Képek (JPG/PNG) → OCR
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    const ocrText = await ocrWithGemini(buffer);
    return ocrText;
  }

  // Ha semmi nem ismert, próbáljuk meg OCR-rel
  const fallbackText = await ocrWithGemini(buffer);
  return fallbackText;
}
