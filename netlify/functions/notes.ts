import type { Config } from "@netlify/functions";
import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { desc, or, ilike } from "drizzle-orm";

export default async (req: Request) => {
  const user = await getSupabaseUser(req);

  if (req.method === "GET") {
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim();

    let rows;
    if (query) {
      const words = query.split(/\s+/).filter((w) => w.length > 1);
      if (words.length === 0) {
        rows = await db
          .select()
          .from(uploadedNotes)
          .orderBy(desc(uploadedNotes.createdAt))
          .limit(100);
      } else {
        const conditions = words.flatMap((word) => [
          ilike(uploadedNotes.originalName, `%${word}%`),
          ilike(uploadedNotes.textContent, `%${word}%`),
        ]);
        rows = await db
          .select()
          .from(uploadedNotes)
          .where(or(...conditions))
          .orderBy(desc(uploadedNotes.createdAt))
          .limit(100);
      }
    } else {
      rows = await db
        .select()
        .from(uploadedNotes)
        .orderBy(desc(uploadedNotes.createdAt))
        .limit(100);
    }

    return Response.json(rows);
  }

  if (req.method === "POST") {
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { fileName, originalName, publicUrl, fileSize } = body;

    if (!fileName || !originalName || !publicUrl) {
      return Response.json(
        { error: "fileName, originalName, and publicUrl are required" },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(uploadedNotes)
      .values({
        fileName,
        originalName,
        publicUrl,
        fileSize: fileSize || 0,
        uploaderIdentityId: user.id,
      })
      .returning();

    return Response.json(inserted, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {};
