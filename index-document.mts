import type { Config, Context } from "@netlify/functions";
import { getSupabaseUser } from "./auth-helper.js";
import { createClient } from "@supabase/supabase-js";
import { PDFParse } from "pdf-parse";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Netlify.env.get("SUPABASE_URL");
  const serviceRoleKey = Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Supabase configuration missing" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json();
  const { noteId, fileName } = body;

  if (!noteId || !fileName) {
    return Response.json(
      { error: "noteId and fileName are required" },
      { status: 400 }
    );
  }

  const { data: fileData, error: downloadError } = await supabase.storage
    .from("jegyzetek")
    .download(fileName);

  if (downloadError || !fileData) {
    return Response.json(
      { error: "Failed to download file from storage" },
      { status: 500 }
    );
  }

  let textContent = "";
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".txt")) {
    textContent = await fileData.text();
  } else if (lowerName.endsWith(".pdf")) {
    try {
      const buffer = Buffer.from(await fileData.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      textContent = pdfData.text;
      await parser.destroy();
    } catch (e) {
      console.error("PDF parse error:", e);
      textContent = "";
    }
  }

  if (textContent) {
    await db
      .update(uploadedNotes)
      .set({ textContent })
      .where(eq(uploadedNotes.id, Number(noteId)));
  }

  return Response.json({ success: true, indexed: textContent.length > 0 });
};

export const config: Config = {};
