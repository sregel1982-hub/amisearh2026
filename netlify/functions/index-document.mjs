import { getSupabaseUser } from "./auth-helper.mjs";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq, and, ne, isNotNull, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

/* Auto-migration (idempotens, Lambda instance-onként egyszer) */
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
    _schemaEnsured = true;
  } catch (e) { console.error("[index-document] ensureSchema failed:", e?.message); }
}

/**
 * /.netlify/functions/index-document
 *  POST { noteId, fileName }
 *
 *  - Letölti a fájlt Supabase Storage-ból
 *  - PDF / TXT-ből szöveget kinyer
 *  - SHA-256 hash a normalizált szövegre
 *  - MinHash signature (32 shingle hash) számolás
 *  - Jaccard összehasonlítás a hasonló tantárgyú jegyzetekkel
 *  - Mentés a plagiarism_score + similar_note_ids mezőbe
 */
export default async function handler(req) {
  if (req.method !== "POST") return jerr("Method not allowed", 405);
  await ensureSchema();

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Unauthorized", 401);

  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_URL")) ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    (typeof Netlify !== "undefined" &&
      (Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
        Netlify.env.get("SERVICE_ROLE_KEY"))) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return jerr("Supabase configuration missing", 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return jerr("Invalid JSON", 400);
  }

  const { noteId, fileName } = body || {};
  if (!noteId || !fileName) return jerr("noteId and fileName are required", 400);

  /* 1. fájl letöltése */
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("jegyzetek")
    .download(fileName);

  if (downloadError || !fileData) {
    return jerr("Failed to download file from storage", 500);
  }

  /* 2. szöveg kinyerése */
  let textContent = "";
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".txt")) {
    textContent = await fileData.text();
  } else if (lower.endsWith(".pdf")) {
    try {
      const data = new Uint8Array(await fileData.arrayBuffer());
      const parser = new PDFParse({ data });
      const result = await parser.getText();
      textContent = result?.text || "";
    } catch (e) {
      console.error("PDF parse error:", e);
    }
  } else if (lower.endsWith(".docx")) {
    try {
      const arrayBuffer = await fileData.arrayBuffer();
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      textContent = result?.value || "";
    } catch (e) {
      console.error("DOCX parse error:", e);
    }
  }

  if (!textContent || textContent.length < 50) {
    return jok({
      success: true,
      indexed: false,
      message: "Nem sikerült értelmezhető szöveget kinyerni a dokumentumból."
    });
  }

  /* 3. szöveg normalizálás + hash */
  const normalized = normalizeText(textContent);
  const textHash = createHash("sha256").update(normalized).digest("hex");

  /* 4. MinHash signature */
  const signature = minHashSignature(normalized, 32);

  /* 5. hasonló jegyzetek keresése (azonos tantárgyú, vagy összes friss) */
  const [currentNote] = await db
    .select()
    .from(uploadedNotes)
    .where(eq(uploadedNotes.id, Number(noteId)))
    .limit(1);

  let candidates = [];
  if (currentNote?.subject) {
    candidates = await db
      .select({
        id: uploadedNotes.id,
        title: uploadedNotes.title,
        textHash: uploadedNotes.textHash,
        shingleSignature: uploadedNotes.shingleSignature
      })
      .from(uploadedNotes)
      .where(
        and(
          ne(uploadedNotes.id, Number(noteId)),
          eq(uploadedNotes.subject, currentNote.subject),
          isNotNull(uploadedNotes.shingleSignature)
        )
      )
      .limit(200);
  }

  let bestScore = 0;
  const similar = [];

  for (const cand of candidates) {
    /* Pontos egyezés: text_hash megegyezik → 100% */
    if (cand.textHash && cand.textHash === textHash) {
      similar.push({ id: cand.id, title: cand.title, score: 100 });
      bestScore = 100;
      continue;
    }

    if (!cand.shingleSignature || !Array.isArray(cand.shingleSignature)) continue;
    const score = jaccardSimilarity(signature, cand.shingleSignature);
    const pct = Math.round(score * 100);
    if (pct >= 50) {
      similar.push({ id: cand.id, title: cand.title, score: pct });
      if (pct > bestScore) bestScore = pct;
    }
  }

  /* 6. mentés */
  await db
    .update(uploadedNotes)
    .set({
      textContent: textContent.slice(0, 1_000_000), // 1MB cap
      textHash,
      shingleSignature: signature,
      plagiarismScore: bestScore,
      similarNoteIds: similar.slice(0, 10)
    })
    .where(eq(uploadedNotes.id, Number(noteId)));

  return jok({
    success: true,
    indexed: true,
    textLength: textContent.length,
    plagiarismScore: bestScore,
    similar: similar.slice(0, 10),
    message:
      bestScore >= 80
        ? "Plágium gyanús: nagy egyezés egy meglévő jegyzettel."
        : bestScore >= 50
        ? "Részleges egyezést találtunk egy meglévő jegyzettel."
        : "Egyedi tartalom."
  });
}

/* ───────────────────  Helper fügvények  ─────────────────── */

function normalizeText(s) {
  return s
    .toLowerCase()
    .replace(/[áàâä]/g, "a")
    .replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i")
    .replace(/[óòôöő]/g, "o")
    .replace(/[úùûüű]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 32-elemű MinHash signature 5-szavas shingle-ekből.
 * Determinisztikus, mert ugyanazokat az "ősi" hash konstansokat használja.
 */
function minHashSignature(normalizedText, k = 32) {
  const words = normalizedText.split(" ").filter((w) => w.length > 2);
  if (words.length < 5) return new Array(k).fill(0);

  const shingles = new Set();
  for (let i = 0; i <= words.length - 5; i++) {
    shingles.add(words.slice(i, i + 5).join(" "));
  }

  const signature = new Array(k).fill(0xffffffff);
  const seeds = [];
  for (let s = 0; s < k; s++) {
    seeds.push(0x9e3779b1 + s * 0x85ebca77);
  }

  for (const sh of shingles) {
    for (let s = 0; s < k; s++) {
      const h = hash32(sh, seeds[s]);
      if (h < signature[s]) signature[s] = h;
    }
  }
  return signature;
}

/* FNV-1a-szerű 32 bites determinisztikus hash */
function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // További keverés
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function jaccardSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) same++;
  }
  return same / a.length;
}

/* response helpers */
function jok(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}
function jerr(m, s = 400) {
  return new Response(JSON.stringify({ error: m }), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
