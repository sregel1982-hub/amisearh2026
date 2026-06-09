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

async function extractTextWithGemini(buffer, mimeType) {
  try {
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [{
        role: "user",
        parts: [
          { inlineData: { data: buffer.toString("base64"), mimeType } },
          { text: "Olvasd ki a teljes szöveget a képről/dokumentumról. Csak a nyers szöveget add vissza, semmi magyarázat." }
        ]
      }]
    });
    return normalizeText(result.text || "");
  } catch (e) {
    console.warn("Gemini OCR failed:", e.message);
    return "";
  }
}

export default async function handler(req) {
  try {
    const body = await req.json();
    const { noteId, filePath, fileName } = body;

    if (!noteId || !filePath) {
      return new Response(JSON.stringify({ error: "Missing noteId or filePath" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Fájl letöltése
    let buffer;
    if (filePath.startsWith('http')) {
      const resp = await fetch(filePath);
      buffer = Buffer.from(await resp.arrayBuffer());
    } else {
      const { data, error } = await supabase.storage.from("jegyzetek").download(filePath);
      if (error || !data) throw new Error("Storage download failed");
      buffer = Buffer.from(await data.arrayBuffer());
    }

    // Szöveg kinyerése
    let textContent = "";
    const ext = (filePath.split(".").pop() || "").toLowerCase();

    if (["txt", "md"].includes(ext)) {
      textContent = normalizeText(buffer.toString("utf8"));
    } else {
      // Minden máshoz Gemini OCR
      const mime = ext === "pdf" ? "application/pdf" : 
                  ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
      textContent = await extractTextWithGemini(buffer, mime);
    }

    // Ha túl rövid a szöveg
    if (textContent.length < 30) {
      const fn = fileName || filePath.split('/').pop();
      textContent = `Fájl: ${fn}\n\nAutomatikus szövegkinyerés nem sikerült megfelelően. Kérlek másold be manuálisan a szöveget, ha szeretnéd, hogy az AI dolgozzon vele.`;
    }

    const textHash = createHash("sha256").update(textContent).digest("hex");

    // Frissítés az adatbázisban
    const { error: updateError } = await supabase
      .from("jegyzetek")
      .update({ 
        text_content: textContent,
        processed: true,
        text_hash: textHash 
      })
      .eq("id", noteId);

    if (updateError) {
      console.error("Update failed:", updateError);
      return new Response(JSON.stringify({ error: "Failed to save extracted text" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      textLength: textContent.length 
    }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Index document error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
