import type { Config } from "@netlify/functions";
import { db } from "../../db/index.js";
import { uploadedNotes } from "../../db/schema.js";
import { desc, or, ilike } from "drizzle-orm";

export default async (req: Request) => {
  if (req.method === "GET") {
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

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {};
