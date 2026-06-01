// netlify/functions/index-document.mjs
import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq, and, ne, isNotNull } from "drizzle-orm";
import { createHash } from "node:crypto";

let _schemaEnsured = false;
async function ensureSchema() {
  if (_schemaEnsured) return;
  try {
    await db.execute(`
      ALTER TABLE uploaded_notes
        ADD COLUMN IF NOT EXISTS text_content TEXT,
        ADD COLUMN IF NOT EXISTS text_hash TEXT,
        ADD COLUMN IF NOT EXISTS shingle_signature JSONB,
        ADD COLUMN IF NOT EXISTS plagiarism_score INTEGER,
        ADD COLUMN IF NOT EXISTS similar_note_ids JSONB
    `);
    _schemaEnsured = true;
  } catch (e) {
    console.error("[index-document] ensureSchema failed:", e?.message);
    // Ne álljunk meg a hiba miatt – folytassuk
    _schemaEnsured = true;
  }
}
