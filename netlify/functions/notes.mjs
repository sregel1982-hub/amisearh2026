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
    /* nem dobunk hibát — a kéréskezelés próbálja meg amúgy is */
  }
}

/**
 * /.netlify/functions/notes
 *  - GET   ?q=...           : keresés saját + nyilvános jegyzetekben
 *  - POST  { fileName, originalName, publicUrl, fileSize, fileHash,
 *            title, subject, language }
 *           : új jegyzet regisztrálása. Hash-alapú dedupe a feltöltőnél.
 *  - DELETE ?id=...         : saját jegyzet törlése
 */

export default async function handler(req) {
  try {
    await ensureSchema();
    const user = await getSupabaseUser(req);
    if (!user) return jerr("Bejelentkezés szükséges (Unauthorized).", 401);

    const url = new URL(req.url);

    /* ───────────────────────  GET (lista / keresés) ───────────────────── */
    if (req.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();

      let rows;
      if (q) {
        const like = `%${q}%`;
        rows = await db
          .select()
          .from(uploadedNotes)
          .where(
            or(
              ilike(uploadedNotes.originalName, like),
              ilike(uploadedNotes.title, like),
              ilike(uploadedNotes.subject, like),
              ilike(uploadedNotes.textContent, like)
            )
          )
          .orderBy(desc(uploadedNotes.createdAt))
          .limit(50);
      } else {
        rows = await db
          .select()
          .from(uploadedNotes)
          .orderBy(desc(uploadedNotes.createdAt))
          .limit(50);
      }
      return jok(rows);
    }

    /* ───────────────────────  POST (új jegyzet) ─────────────────────── */
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
        return jerr("fileName, originalName, publicUrl kötelező.", 400);
      if (!title || !subject)
        return jerr("A cím (title) és tantárgy (subject) kötelező.", 400);
      if (!fileHash)
        return jerr("fileHash kötelező (kliens oldalon SHA-256).", 400);

      /* Per-user dedupe — ugyanazt a fájlt nem lehet kétszer feltölteni */
      let existing = [];
      try {
        existing = await db
          .select()
          .from(uploadedNotes)
          .where(
            and(
              eq(uploadedNotes.uploaderIdentityId, user.id),
              eq(uploadedNotes.fileHash, fileHash)
            )
          )
          .limit(1);
      } catch (e) {
        console.error("[notes] dedupe query failed:", e?.message || e);
        // Ha a file_hash oszlop még nem létezik → folytatjuk dedupe nélkül
        if (!/column .* does not exist/i.test(String(e?.message))) {
          return jerr(
            "Adatbázis hiba a dedupe ellenőrzés alatt: " + (e?.message || e),
            500
          );
        }
      }

      if (existing.length > 0) {
        return new Response(
          JSON.stringify({
            error: "duplicate",
            message:
              "Ezt a fájlt már feltöltötted. Egy dokumentum csak egyszer tölthető fel.",
            existing: existing[0]
          }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }

      /* Mentés */
      try {
        const [inserted] = await db
          .insert(uploadedNotes)
          .values({
            fileName,
            originalName,
            publicUrl,
            fileSize: fileSize || 0,
            uploaderIdentityId: user.id,
            title: String(title).trim().slice(0, 200),
            subject: String(subject).trim().slice(0, 100),
            language: language || null,
            fileHash
          })
          .returning();
        return jok(inserted, 201);
      } catch (e) {
        console.error("[notes] insert failed:", e?.message || e);
        return jerr(
          "Mentési hiba: " + (e?.message || String(e)) +
            ". (Lehet hogy a Neon migráció nem futott le? Lásd: 0002_metadata_and_plagiarism.sql)",
          500
        );
      }
    }

    /* ───────────────────────  DELETE (saját) ───────────────────────── */
    if (req.method === "DELETE") {
      const id = Number(url.searchParams.get("id"));
      if (!id) return jerr("id required", 400);

      const [row] = await db
        .select()
        .from(uploadedNotes)
        .where(eq(uploadedNotes.id, id))
        .limit(1);

      if (!row) return jerr("Not found", 404);
      if (row.uploaderIdentityId !== user.id) return jerr("Forbidden", 403);

      await db.delete(uploadedNotes).where(eq(uploadedNotes.id, id));
      return jok({ success: true });
    }

    return jerr("Method not allowed", 405);
  } catch (err) {
    console.error("[notes] FATAL:", err?.message, err?.stack);
    return jerr(
      "Szerver hiba (" + (err?.name || "Error") + "): " + (err?.message || String(err)),
      500
    );
  }
}

/* helpers */
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
