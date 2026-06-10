import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import mammoth from "mammoth";
import { getSupabaseUser } from "./auth-helper.mjs";
import { downloadFromRefs } from "./storage-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase környezeti változó hiányzik.");
  return createClient(url, key);
}

function normalizeText(t) {
  return String(t || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(buffer) {
  try {
    const mod = await import("pdf-parse");
    const parse = mod.default || mod;
    const result = await parse(buffer);
    return normalizeText(result.text || "");
  } catch (error) {
    console.warn("pdf-parse sikertelen:", error?.message || error);
    return "";
  }
}

async function extractTextWithGemini(buffer, mimeType) {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) return "";
  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: buffer.toString("base64"), mimeType } },
          { text: "Olvasd ki a teljes szöveget a dokumentumból. Csak a nyers szöveget add vissza, magyarázat nélkül. Őrizd meg a magyar ékezeteket." }
        ]
      }]
    });
    return normalizeText(result.text || "");
  } catch (e) {
    console.warn("Gemini OCR failed:", e?.message || e);
    return "";
  }
}

function mimeFromExtension(ext) {
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "doc") return "application/msword";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

async function extractText(buffer, filePath) {
  const ext = (filePath.split(".").pop() || "").toLowerCase();
  if (["txt", "md", "csv", "json"].includes(ext)) return normalizeText(buffer.toString("utf8"));
  if (ext === "docx") {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = normalizeText(result.value || "");
      if (text.length > 20) return text;
    } catch (error) {
      console.warn("DOCX olvasás sikertelen:", error?.message || error);
    }
  }
  if (ext === "pdf") {
    const pdfText = await extractPdfText(buffer);
    if (pdfText.length > 30) return pdfText;
  }
  return extractTextWithGemini(buffer, mimeFromExtension(ext));
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await getSupabaseUser(req);
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const noteId = body.noteId;
    let filePath = body.filePath || body.fileName || body.file_name;
    if (!noteId) return json({ error: "Missing noteId" }, 400);

    const supabase = getSupabaseAdmin();
    const { data: note, error: noteError } = await supabase
      .from("jegyzetek")
      .select("id, file_path, public_url, original_name, user_id")
      .eq("id", noteId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (noteError) return json({ error: noteError.message }, 500);
    if (!note) return json({ error: "Note not found" }, 404);
    filePath = filePath || note.file_path;
    if (!filePath) return json({ error: "Missing file path" }, 400);

    let buffer;
    if (/^https?:\/\//i.test(filePath)) {
      try {
        const resp = await fetch(filePath);
        if (resp.ok) buffer = Buffer.from(await resp.arrayBuffer());
      } catch (_) {}
    }
    if (!buffer) {
      const downloaded = await downloadFromRefs(supabase, [filePath, note.public_url]);
      if (!downloaded.data) throw new Error(downloaded.error?.message || "Storage download failed");
      buffer = Buffer.from(await downloaded.data.arrayBuffer());
    }

    let textContent = await extractText(buffer, filePath);
    if (textContent.length < 30) {
      const fn = note.original_name || filePath.split('/').pop();
      textContent = `Fájl: ${fn}\n\nAutomatikus szövegkinyerés nem sikerült megfelelően. Ha ez beszkennelt kép vagy régi Word/PDF, tölts fel jobb minőségű PDF-et vagy másold be a szöveget az AI chatbe.`;
    }

    const textHash = createHash("sha256").update(textContent).digest("hex");
    const { error: updateError } = await supabase
      .from("jegyzetek")
      .update({ text_content: textContent, processed: true, text_hash: textHash })
      .eq("id", noteId)
      .eq("user_id", user.id);

    if (updateError) return json({ error: updateError.message }, 500);
    return json({ success: true, textLength: textContent.length, textPreview: textContent.slice(0, 500) });
  } catch (error) {
    console.error("Index document error:", error);
    return json({ error: error.message || "Internal server error" }, 500);
  }
}
