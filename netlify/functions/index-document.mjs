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

async function downloadFile(filePath) {
 if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
  const resp = await fetch(filePath);
  if (!resp.ok) throw new Error('HTTP download failed: ' + resp.status);
  return Buffer.from(await resp.arrayBuffer());
 }

 const { data: fileData, error: dlErr } = await supabase.storage
  .from("jegyzetek")
  .download(filePath);

 if (dlErr || !fileData) {
  throw new Error('Storage download failed: ' + (dlErr?.message || 'no data'));
 }

 return Buffer.from(await fileData.arrayBuffer());
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
 // JAVÍTÁS: Ha a PDF-ből nem sikerült szöveget kinyerni, OCR-rel próbáljuk
 try {
  const ocrText = await ocrWithGemini(buffer, "application/pdf");
  if (ocrText.length > 20) return ocrText;
 } catch (e) {
  console.warn("PDF OCR failed:", e.message);
 }
 // Ha minden próbálkozás sikertelen, üres stringet adunk vissza
 return "";
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

export default async function handler(req) {
 try {
  const body = await req.json();
  const noteId = body.noteId;
  const filePath = body.fileName || body.filePath;

  if (!noteId || !filePath) {
   return new Response(JSON.stringify({ error: "Missing parameters (noteId, fileName)" }), {
    status: 400,
    headers: { "Content-Type": "application/json" }
   });
  }

  const buffer = await downloadFile(filePath);
  let textContent = normalizeText(await extractText(buffer, filePath));

  // JAVÍTÁS: Ha nem sikerült szöveget kinyerni, fallback üzenet
  if (textContent.length < 20) {
   const fileName = filePath.split('/').pop();
   textContent = `Fájl: ${fileName}\n\nA fájl szövege nem volt kinyerhető automatikusan. Lehetséges okok:\n- Képes PDF (a szöveg képként van tárolva)\n- Képfájl (JPG, PNG)\n- Védett vagy beolvasott dokumentum\n\nKérlek másold be a szöveget manuálisan, ha szeretnéd, hogy az AI részletesen elmagyarázza a tartalmát.`;
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

  if (updErr) {
   return new Response(JSON.stringify({ error: "DB update failed: " + updErr.message }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
   });
  }

  return new Response(JSON.stringify({ 
   success: true, 
   length: textContent.length, 
   embedded: !!embedding,
   isFallback: textContent.includes("nem volt kinyerhető")
  }), {
   status: 200,
   headers: { "Content-Type": "application/json" }
  });

 } catch (err) {
  console.error("Index document error:", err);
  return new Response(JSON.stringify({ error: err.message }), {
   status: 500,
   headers: { "Content-Type": "application/json" }
  });
 }
}

export const config = {};
