import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { getSupabaseUser } from "./auth-helper.mjs";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });
const DEFAULT_MODEL = getEnv("GEMINI_MODEL") || "gemini-2.5-flash";
const MAX_TOTAL_CONTEXT_CHARS = 52000;
const MAX_NOTE_CHARS = 14000;
const MAX_NOTES = 8;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeText(text) {
  return String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeTitle(note) {
  return String(
    note?.title ||
    note?.cim ||
    note?.originalName ||
    note?.original_name ||
    note?.fileName ||
    note?.file_name ||
    note?.filePath ||
    note?.file_path ||
    "Névtelen jegyzet"
  ).slice(0, 180);
}

function getFilePath(note) {
  return note?.filePath || note?.file_path || note?.fileName || note?.file_name || note?.path || "";
}

function fileExt(path) {
  const clean = String(path || "").split("?")[0].toLowerCase();
  return clean.includes(".") ? clean.split(".").pop() : "";
}

function mimeFromExt(ext) {
  const map = {
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  };
  return map[ext] || "application/octet-stream";
}

async function downloadNoteBuffer(note) {
  const filePath = getFilePath(note);
  if (!filePath) return null;

  if (/^https?:\/\//i.test(filePath)) {
    const resp = await fetch(filePath);
    if (!resp.ok) throw new Error("Nem sikerült letölteni a jegyzetfájlt: HTTP " + resp.status);
    return Buffer.from(await resp.arrayBuffer());
  }

  const { data, error } = await supabase.storage.from("jegyzetek").download(filePath);
  if (error || !data) throw new Error("Nem sikerült letölteni a jegyzetfájlt a tárhelyről.");
  return Buffer.from(await data.arrayBuffer());
}

async function extractDocx(buffer) {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return normalizeText(result.value || "");
  } catch (error) {
    console.warn("DOCX extraction fallback to Gemini:", error?.message || error);
    return "";
  }
}

async function extractWithGemini(buffer, mimeType) {
  const result = await ai.models.generateContent({
    model: DEFAULT_MODEL,
    contents: [{
      role: "user",
      parts: [
        { inlineData: { data: buffer.toString("base64"), mimeType } },
        { text: "Olvasd ki a dokumentum teljes tanulási szövegét. Csak a nyers szöveget add vissza, magyarázat, Markdown és kommentár nélkül. Őrizd meg a magyar ékezeteket." }
      ]
    }],
    config: {
      temperature: 0.1
    }
  });
  return normalizeText(result.text || "");
}

async function ensureNoteText(note) {
  let text = normalizeText(note?.textContent || note?.text_content || note?.content || "");
  if (text.length >= 40) return text;

  const filePath = getFilePath(note);
  if (!filePath) return text;

  const buffer = await downloadNoteBuffer(note);
  if (!buffer) return text;

  const ext = fileExt(filePath);
  if (["txt", "md", "csv", "json"].includes(ext)) {
    text = normalizeText(buffer.toString("utf8"));
  } else if (ext === "docx") {
    text = await extractDocx(buffer);
    if (text.length < 40) text = await extractWithGemini(buffer, mimeFromExt(ext));
  } else {
    text = await extractWithGemini(buffer, mimeFromExt(ext));
  }

  if (text.length >= 40 && note?.id) {
    const textHash = createHash("sha256").update(text).digest("hex");
    const updatePayload = { text_content: text, processed: true, text_hash: textHash };
    const { error } = await supabase.from("jegyzetek").update(updatePayload).eq("id", note.id);
    if (error) console.warn("Text save failed:", error.message);
  }

  return text;
}

function tokenize(text) {
  return String(text || "")
    .toLocaleLowerCase("hu")
    .replace(/[^a-z0-9áéíóöőúüű\s-]/gi, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3)
    .slice(0, 40);
}

function scoreNote(note, text, question) {
  const tokens = tokenize(question);
  if (!tokens.length) return 1;
  const haystack = (safeTitle(note) + "\n" + String(note?.subject || "") + "\n" + text.slice(0, 30000)).toLocaleLowerCase("hu");
  let score = 0;
  for (const token of tokens) {
    const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = haystack.match(re);
    if (matches) score += Math.min(matches.length, 10);
  }
  return score;
}

function buildContext(items) {
  let total = 0;
  const blocks = [];
  for (const item of items) {
    if (total >= MAX_TOTAL_CONTEXT_CHARS) break;
    const title = safeTitle(item.note);
    const subject = item.note?.subject ? `Tantárgy: ${item.note.subject}\n` : "";
    const remaining = MAX_TOTAL_CONTEXT_CHARS - total;
    const body = item.text.slice(0, Math.min(MAX_NOTE_CHARS, remaining));
    total += body.length;
    blocks.push(`--- JEGYZET ${blocks.length + 1}: ${title} ---\n${subject}${body}`);
  }
  return { text: blocks.join("\n\n"), chars: total };
}

function systemInstruction(lang, mode) {
  const hu = lang !== "en";
  const base = hu
    ? `Te az AMISEARCH jegyzetalapú tanulási asszisztense vagy. A válaszod elsődleges forrása a felhasználó saját feltöltött jegyzeteinek szövege. Ha az információ nincs benne a jegyzetekben, mondd ki egyértelműen: "Ezt a feltöltött jegyzetekben nem találtam." Ezután adhatsz rövid általános magyarázatot, de jelöld, hogy az már általános tudás. Magyarul, pontosan, tanulóbarát módon válaszolj. Ne találj ki jegyzettartalmat. A fontos állításoknál hivatkozz a jegyzet címére ilyen formában: [Jegyzet: cím].`
    : `You are the AMISEARCH note-grounded study assistant. Your primary source is the user's uploaded note text. If the answer is not present in the notes, clearly say that it was not found in the uploaded notes. You may add a short general explanation, but mark it as general knowledge. Do not invent note content. Cite note titles like this: [Note: title].`;
  if (mode === "summary") {
    return base + (hu
      ? " Készíts jól tagolt, vizsgára használható összefoglalót: fő fogalmak, lényeg, példák, gyakorlókérdések."
      : " Create a well-structured exam-ready summary: key concepts, main points, examples, and practice questions.");
  }
  return base;
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!getEnv("GEMINI_API_KEY")) return json({ error: "A GEMINI_API_KEY nincs beállítva.", code: "gemini_missing_key" }, 503);

    const user = await getSupabaseUser(req);
    if (!user?.id) return json({ error: "Bejelentkezés szükséges.", code: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const question = normalizeText(body.question || body.message || "");
    const lang = body.lang === "en" ? "en" : "hu";
    const mode = body.mode === "summary" ? "summary" : "qa";
    const requestedIds = [];
    if (body.noteId) requestedIds.push(String(body.noteId));
    if (Array.isArray(body.noteIds)) requestedIds.push(...body.noteIds.map(String));
    const uniqueIds = [...new Set(requestedIds.filter(Boolean))];

    if (!question && mode !== "summary") {
      return json({ error: "Hiányzik a kérdés.", code: "missing_question" }, 400);
    }

    let query = supabase.from("jegyzetek").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(80);
    if (uniqueIds.length) query = query.in("id", uniqueIds);
    const { data: notes, error } = await query;
    if (error) return json({ error: error.message, code: "notes_query_failed" }, 500);
    if (!notes?.length) return json({ error: "Nem találtam saját feltöltött jegyzetet ehhez a felhasználóhoz.", code: "no_notes" }, 404);

    const processed = [];
    for (const note of notes) {
      try {
        const text = await ensureNoteText(note);
        if (normalizeText(text).length >= 40) {
          processed.push({ note, text: normalizeText(text), score: scoreNote(note, text, question || safeTitle(note)) });
        }
      } catch (e) {
        console.warn("Note text extraction failed", note?.id, e?.message || e);
      }
    }

    if (!processed.length) {
      return json({
        error: "A kiválasztott jegyzetekből nem sikerült használható szöveget kinyerni. TXT, DOCX vagy jól olvasható PDF feltöltése javasolt.",
        code: "empty_content"
      }, 422);
    }

    processed.sort((a, b) => b.score - a.score);
    const selected = processed.slice(0, Math.min(MAX_NOTES, Number(body.limit) || MAX_NOTES));
    const context = buildContext(selected);

    const promptQuestion = question || (lang === "hu" ? "Készíts összefoglalót a jegyzetből." : "Summarize the note.");
    const userPrompt = lang === "hu"
      ? `Felhasználói kérdés:\n${promptQuestion}\n\nFeltöltött jegyzetek szövege:\n${context.text}`
      : `User question:\n${promptQuestion}\n\nUploaded note text:\n${context.text}`;

    const response = await ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemInstruction(lang, mode),
        temperature: Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.35
      }
    });

    const answer = normalizeText(response.text || "");
    return json({
      answer,
      model: DEFAULT_MODEL,
      noteCount: selected.length,
      contextChars: context.chars,
      usedNotes: selected.map(item => ({
        id: item.note.id,
        title: safeTitle(item.note),
        score: item.score,
        chars: item.text.length
      }))
    });
  } catch (error) {
    console.error("gemini-notes error:", error);
    return json({ error: error?.message || String(error), code: "gemini_notes_failed" }, 500);
  }
}
