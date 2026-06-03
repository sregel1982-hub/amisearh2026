import { getSupabaseUser } from "./auth-helper.mjs";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";

let _schemaEnsured = false;
async function ensureSchema() {
  if (_schemaEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE uploaded_notes
        ADD COLUMN IF NOT EXISTS textContent TEXT,
        ADD COLUMN IF NOT EXISTS embedding JSONB
    `);
    _schemaEnsured = true;
  } catch (e) {
    console.error("[notes] ensureSchema failed:", e?.message);
  }
}

export default async function handler(req) {
  try {
    await ensureSchema();
    const user = await getSupabaseUser(req);
    if (!user) return jerr("Unauthorized", 401);

    const url = new URL(req.url);

    if (req.method === "POST") {
      let body;
      try {
        body = await req.json();
      } catch {
        return jerr("Invalid JSON body", 400);
      }

      const {
        fileName, originalName, publicUrl, fileSize,
        fileHash, title, subject, language
      } = body || {};

      if (!fileName || !originalName || !publicUrl)
        return jerr("fileName, originalName, publicUrl required", 400);

      let inserted;
      try {
        [inserted] = await db
          .insert(uploadedNotes)
          .values({
            fileName,
            originalName,
            publicUrl,
            fileSize: fileSize || 0,
            uploaderIdentityId: user.id,
            title,
            subject,
            language,
            fileHash
          })
          .returning();
      } catch (e) {
        return jerr("Insert failed: " + e?.message, 500);
      }

      // OCR trigger
      try {
        await fetch("https://amisearch.org/.netlify/functions/OCR", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId: inserted.id })
        });
      } catch (e) {
        console.error("[notes] OCR trigger failed:", e?.message);
      }

      return jok(inserted, 201);
    }

    return jerr("Method not allowed", 405);

  } catch (err) {
    return jerr("Server error: " + err?.message, 500);
  }
}

function jok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
function jerr(msg, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
