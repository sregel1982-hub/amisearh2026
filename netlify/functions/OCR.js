import { getSupabaseUser } from "./auth-helper.js";
import { jsonError } from "./ai-response.js";
import Tesseract from "tesseract.js";
import { readFile } from "fs/promises";
import { fromBuffer } from "pdf2pic";
import mammoth from "mammoth";
import PptxToImages from "pptx-to-images";

export default async function handler(req) {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return jsonError("Unauthorized", 401, "unauthorized");
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, "invalid_json");
  }

  const { filePath, fileType } = body;

  if (!filePath || !fileType) {
    return jsonError("Missing filePath or fileType", 400, "missing_input");
  }

  let buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return jsonError("File not found on server", 404, "file_not_found");
  }

  let images = [];

  // --- PDF ---
  if (fileType === "pdf") {
    const converter = fromBuffer(buffer, {
      density: 200,
      format: "png",
      width: 1200,
      height: 1600,
    });

    const pages = await converter(1, true);
    images = pages.map((p) => p.path);
  }

  // --- DOCX ---
  else if (fileType === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return new Response(
      JSON.stringify({ text: result.value }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  }

  // --- PPTX ---
  else if (fileType === "pptx") {
    const ppt = new PptxToImages();
    const slides = await ppt.convert(buffer);
    images = slides.map((s) => s.path);
  }

  // --- JPG/PNG ---
  else if (["jpg", "jpeg", "png"].includes(fileType)) {
    images = [filePath];
  }

  if (images.length === 0) {
    return jsonError("Unsupported file type", 400, "unsupported_type");
  }

  // --- OCR minden képre ---
  let fullText = "";

  for (const img of images) {
    const result = await Tesseract.recognize(img, "hun+eng", {
      logger: () => {},
    });
    fullText += result.data.text + "\n";
  }

  return new Response(
    JSON.stringify({ text: fullText }),
    { headers: { "Content-Type": "application/json" }, status: 200 }
  );
}
