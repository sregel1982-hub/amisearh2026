// netlify/functions/index-document.mjs
import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import pdfParse from "pdf-parse";
import mammoth from "mammoth";
import { createHash } from "node:crypto";

// 1) Supabase init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 2) Hash helper
function hashText(text) {
  return createHash("sha256").update(text).digest("hex");
}

// 3) Main handler
export const handler = async (event) => {
  try {
    const user = await getSupabaseUser(event);
    if (!user) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Not authenticated" })
      };
    }

    const { noteId, filePath } = JSON.parse(event.body);

    if (!noteId || !filePath) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing noteId or filePath" })
      };
    }

    // 4) Download file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from("notes")
      .download(filePath);

    if (downloadError) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to download file" })
      };
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());

    // 5) Extract text
    let textContent = "";

    if (filePath.endsWith(".pdf")) {
      const parsed = await pdfParse(buffer);
      textContent = parsed.text || "";
    } else if (filePath.endsWith(".docx")) {
      const result = await mammoth.extractRawText({ buffer });
      textContent = result.value || "";
    } else if (filePath.endsWith(".txt")) {
      textContent = buffer.toString("utf8");
    } else {
      textContent = "";
    }

    if (!textContent || textContent.trim().length < 10) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No extractable text found" })
      };
    }

    // 6) Hash
    const textHash = hashText(textContent);

    // 7) Generate embeddings (Gemini)
    const embeddingResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedText?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textContent })
      }
    );

    const embeddingJson = await embeddingResponse.json();

    if (!embeddingJson.embedding) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Embedding generation failed" })
      };
    }

    const embedding = embeddingJson.embedding.values;

    // 8) Save to DB
    await db
      .update(uploadedNotes)
      .set({
        text_content: textContent,
        text_hash: textHash,
        embedding
      })
      .where(eq(uploadedNotes.id, noteId));

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Document indexed successfully"
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
