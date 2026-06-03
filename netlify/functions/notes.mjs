import { getSupabaseUser } from "./auth-helper.mjs";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";

/**
 * Egyszer (Lambda instance-onként) megpróbálja hozzáadni a hiányzó
 * oszlopokat. ADD COLUMN IF NOT EXISTS idempotens, biztonságos újrafutáskor.
 */
let _schemaEnsured = false;
async function ensureSchema() {
  if (_schemaEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE uploaded_notes
        ADD COLUMN IF NOT EXISTS title TEXT,
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS language TEXT,
        ADD COLUMN IF NOT EXISTS file_hash TEXT,
        ADD COLUMN IF NOT EXISTS text_hash TEXT,
        ADD COLUMN IF NOT EXISTS shingle_signature JSONB,
        ADD COLUMN IF NOT EXISTS plagiarism_score INTEGER,
        ADD COLUMN IF NOT EXISTS similar_note_ids JSONB
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_uploaded_notes_file_hash ON uploaded_notes(file_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_uploaded_notes_subject ON uploaded_notes(subject)`);
    _schemaEnsured = true;
    console.log("[notes] ensureSchema OK");
  } catch (e) {
    console.error("[notes] ensureSchema failed:", e?.message);
  }
}

/**
 * /.netlify/functions/notes
 */
export default async function handler(req) {
