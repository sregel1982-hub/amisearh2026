import { getSupabaseUser } from "./auth-helper.js";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_URL")) ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY")) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Supabase configuration missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { noteId, fileName } = body;

  if (!noteId || !fileName) {
    return new Response(JSON.stringify({ error: "noteId and fileName are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("jegyzetek")
    .download(fileName);

  if (downloadError || !fileData) {
    return new Response(JSON.stringify({ error: "Failed to download file from storage" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  let textContent = "";
  const lowerName = fileName.toLowerCase();

  // TXT fájl
  if (lowerName.endsWith(".txt")) {
    textContent = await fileData.text();
  }

  // PDF fájl (pdf-parse v2 API)
  else if (lowerName.endsWith(".pdf")) {
    try {
      const data = new Uint8Array(await fileData.arrayBuffer());
      const parser = new PDFParse({ data });
      const result = await parser.getText();
      textContent = result?.text || "";
    } catch (e) {
      console.error("PDF parse error:", e);
      textContent = "";
    }
  }

  // Ha sikerült szöveget kinyerni → mentjük az adatbázisba
  if (textContent) {
    await db
      .update(uploadedNotes)
      .set({ textContent })
      .where(eq(uploadedNotes.id, Number(noteId)));
  }

  return new Response(
    JSON.stringify({ success: true, indexed: textContent.length > 0 }),
    {
      headers: { "Content-Type": "application/json" }
    }
  );
}

export const config = {};
