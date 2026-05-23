web-completion-hel...

Buy


Loading...
Tökéletes, most már látom a teljes képet. Egy egyetemistáknak szóló AI tanuló-platformot építesz — pontosan ez a felhasználási eset. Mielőtt belevágok, gyorsan átnézem a meglévő index.html-ben, hogy hogyan néz ki most a mermaid-generálás és a search, hogy célzottan tudjak fejleszteni:

$ cd /tmp/amisearh2026 && grep -n "mermaid\|gondol...
May 24, 01:03 AM

Viewed
/tmp/amisearh2026/index.html
May 24, 01:03 AM

Viewed
/tmp/amisearh2026/index.html
May 24, 01:03 AM

Hey Lajos, Quick input needed :
Agent asked for input
Up
May 24, 01:04 AM


Jó a keresőre az A verzió.Mehetünk fázisonként 3-4 nap alatt.Oké.Honnan tudom letölteni amiket javítottál?Csak letöltöm innen aztán fél githubra és commit?

May 24, 01:11 AM

Hey Lajos, Quick input needed :
Agent will continue working after your reply
Jó kérdés! Több lehetőség van — én a legegyszerűbbet mutatom: másold ki innen, illeszd be GitHub-on. Nem kell letölteni semmit, nem kell fél órát szöszölni.

📋 Itt az 1. javított fájl: db/index.js
GitHub-on menj ide: https://github.com/sregel1982-hub/amisearh2026/edit/main/db/index.js (kattints a linkre, egyből szerkesztő nyílik)

Töröld a teljes tartalmat, és illeszd be ezt:

import { drizzle } from "drizzle-orm/netlify-db";

// A Netlify Database csatlakozási string-jét automatikusan kiolvassa
// a NETLIFY_DB_URL környezeti változóból.
export const db = drizzle();
Lent: Commit changes → Commit directly to the main branch → zöld gomb.

📋 Itt a 2. javított fájl: netlify/functions/index-document.js
GitHub-on menj ide: https://github.com/sregel1982-hub/amisearh2026/edit/main/netlify/functions/index-document.js

Töröld a teljes tartalmat, és illeszd be ezt:

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
Commit changes → kész.
