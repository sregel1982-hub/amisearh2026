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
        ADD COLUMN IF NOT EXISTS shingle_signaturJSONB,
        ADD COLUMN IF NOT EXISTS plagiarism_score INTEGER,
        ADD COLUMN IF NOT EXISTS similar_note_ids JSONB
    `);
    _schemaEnsured = true;
  } catch (e) {
    console.error("[index-document] ensureSchema failed:", e?.message);
  }
}

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

if (!supabaseUrl || !serviceRoleKey)
    return jerr("Supabase configuration missing", 500);

const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body;
  try { body = await req.json(); } catch { return jerr("Invalid JSON", 400); }

  const { noteId, fileName } = body || {};
  if (!noteId || !fileName) return jerr("noteId and fileName are required", 400);

  // 1. Fájl letöltése Supabase-ből
  const { data: fileData, error: downloadError } = await supabase.storage
    .from("jegyzetek")
  .download(fileName);

  if (downloadError || !fileData) {
    console.error("[index-document] download error:", downloadError);
    return jerr("Nem sikerült letölteni a fájlt: " + (downloadError?.message || "ismeretlen hiba"), 500);
  }

  // 2. Szöveg kinyerése fájltípus alapján
  let textContent = "";
  const lower = fileName.toLowerCase();
  try {
    if (lower.endsWith(".txt")) {
      textContent = await fileData.text();

    } else if (lower.endsWith(".pdf")) {
      // pdf-parse: default import, nem named!
      const pdfParse = (await import("pdf-parse")).default;
      const arrayBuffer = await fileData.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const result = await pdfParse(buffer);
      textContent = result?.text || "";

    } else if (lower.endsWith(".docx")) {
      const mammoth = (await import("mammoth")).default;
      const arrayBuffer = await fileData.arrayBuffer();
      const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
      textContent = result?.value || "";
      } else if (lower.endsWith(".pptx")) {
      const { parseOfficeAsync } = await import("officeparser");
      const arrayBuffer = await fileData.arrayBuffer();
      textContent = await parseOfficeAsync(Buffer.from(arrayBuffer), { outputErrorToConsole: true });

    } else if (lower.endsWith(".doc")) {
      const arrayBuffer = await fileData.arrayBuffer();
      try {
        const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
        textContent = result?.value || "";
      } catch {
        textContent = "";
        }
    }
  } catch (e) {
    console.error("[index-document] text extraction error:", e?.message);
    textContent = "";
  }
  if (!textContent || textContent.trim().length < 20) {
    // Még mindig mentsük el az indexelt állapotot, de szöveg nélkül
    await db.update(uploadedNotes)
      .set({ plagiarismScore: 0, similarNoteIds: [] })
      .where(eq(uploadedNotes.id, Number(noteId)));
    return jok({
      success: true,
      indexed: false,
      message: "Nem sikerült szöveget kinyerni a dokumentumból (lehet szkennelt PDF vagy védett fájl)."
    });
  }
  // 3. Normalizálás + hash
  const normalized = normalizeText(textContent);
  const textHash = createHash("sha256").update(normalized).digest("hex");
  const signature = minHashSignature(normalized, 32);
  // 4. Hasonló jegyzetek keresése
  const [currentNote] = await db
    .select()
    .from(uploadedNotes)
    .where(eq(uploadedNotes.id, Number(noteId)))
    .limit(1);
  let candidates = [];
  if (currentNote?.subject) {
    candidates = await db
      .select({ id: uploadedNotes.id, title: uploadedNotes.title, textHash: uploadedNotes.textHash, shingleSignature: uploadedNotes.shingleSignature })
      .from(uploadedNotes)
    .where(and(
        ne(uploadedNotes.id, Number(noteId)),
        eq(uploadedNotes.subject, currentNote.subject),
        isNotNull(uploadedNotes.shingleSignature)
      ))
      .limit(100);
  }
  let bestScore = 0;
  const similar = [];
  for (const cand of candidates) {
    if (cand.textHash === textHash) { similar.push({ id: cand.id, title: cand.title, score: 100 }); bestScore = 100; continue; }
    if (!Array.isArray(cand.shingleSignature)) continue;
    const pct = Math.round(jaccardSimilarity(signature, cand.shingleSignature) * 100);
    if (pct >= 50) { similar.push({ id: cand.id, title: cand.title, score: pct }); if (pct > bestScore) bestScore = pct; }
  }
  // 5. Mentés az adatbázisba
  await db.update(uploadedNotes)
    .set({
      textContent: textContent.slice(0, 500000),
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
    message: bestScore >= 80 ? "Plágium gyanús!" : bestScore >= 50 ? "Részleges egyezés." : "Egyedi tartalom, sikeresen indexelve."
  });
}

// ─── Helpers ───
function normalizeText(s) {
  return s.toLowerCase()
    .replace(/[áàâä]/g, "a").replace(/[éèêë]/g, "e")
    .replace(/[íìîï]/g, "i").replace(/[óòôöő]/g, "o")
    .replace(/[úùûüű]/g, "u")
    .replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function minHashSignature(text, k = 32) {
  const words = text.split(" ").filter(w => w.length > 2);
  if (words.length < 5) return new Array(k).fill(0);
  const shingles = new Set();
  for (let i = 0; i <= words.length - 5; i++) shingles.add(words.slice(i, i + 5).join(" "));
  const sig = new Array(k).fill(0xffffffff);
  const seeds = Array.from({ length: k }, (_, s) => (0x9e3779b1 + s * 0x85ebca77) >>> 0);
  for (const sh of shingles) for (let s = 0; s < k; s++) { const h = hash32(sh, seeds[s]); if (h < sig[s]) sig[s] = h; }
  return sig;
}
function hash32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return h >>> 0;
}

function jaccardSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let same = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++;
  return same / a.length;
}
function jok(d, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } }); }
function jerr(m, s = 400) { return new Response(JSON.stringify({ error: m }), { status: s, headers: { "Content-Type": "application/json" } }); }

export const config = {};

