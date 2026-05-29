import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { desc, eq, and, or, ilike, sql } from "drizzle-orm";

/**
 * /.netlify/functions/notes
 *  - GET   ?q=...           : keresés saját + nyilvános jegyzetekben
 *  - POST  { fileName, originalName, publicUrl, fileSize, fileHash,
 *            title, subject, language }
 *           : új jegyzet regisztrálása. Hash-alapú dedupe a feltöltőnél.
 *  - DELETE ?id=...         : saját jegyzet törlése
 */

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) {
    return jerr("Unauthorized", 401);
  }

  const url = new URL(req.url);

  /* ───────────────────────  GET (lista / keresés) ───────────────────── */
  if (req.method === "GET") {
    const q = (url.searchParams.get("q") || "").trim();

    let rows;
    if (q) {
      // Egyszerű ILIKE keresés: originalName, title, subject, textContent
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
      return jerr("Invalid JSON", 400);
    }

    const {
      fileName,
      originalName,
      publicUrl,
      fileSize,
      fileHash,
      title,
      subject,
      language
    } = body || {};

    if (!fileName || !originalName || !publicUrl) {
      return jerr("fileName, originalName, publicUrl required", 400);
    }
    if (!title || !subject) {
      return jerr("Cím (title) és tantárgy (subject) kötelező.", 400);
    }
    if (!fileHash) {
      return jerr("fileHash kötelező (kliens oldalon SHA-256).", 400);
    }

    /* Per-user dedupe — ugyanazt a fájlt nem lehet kétszer feltölteni */
    const existing = await db
      .select()
      .from(uploadedNotes)
      .where(
        and(
          eq(uploadedNotes.uploaderIdentityId, user.id),
          eq(uploadedNotes.fileHash, fileHash)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return new Response(
        JSON.stringify({
          error: "duplicate",
          message:
            "Ezt a fájlt már feltöltötted. Egy dokumentum csak egyszer tölthető fel.",
          existing: existing[0]
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    /* Mentés */
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
