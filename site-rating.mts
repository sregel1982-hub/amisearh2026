import type { Config, Context } from "@netlify/functions";
import { db } from "../../db/index.js";
import { siteRatings } from "../../db/schema.js";
import { eq, avg, count } from "drizzle-orm";

function hashIP(ip: string): string {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "ip_" + Math.abs(hash).toString(36);
}

export default async (req: Request, context: Context) => {
  if (req.method === "GET") {
    const result = await db
      .select({
        average: avg(siteRatings.rating),
        total: count(),
      })
      .from(siteRatings);

    const row = result[0];
    return Response.json({
      average: row.average ? parseFloat(String(row.average)) : 0,
      total: row.total || 0,
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { rating } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return Response.json({ error: "Rating must be between 1 and 5" }, { status: 400 });
    }

    const clientIP = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || "unknown";
    const ipHash = hashIP(clientIP);

    const existing = await db
      .select()
      .from(siteRatings)
      .where(eq(siteRatings.ipHash, ipHash));

    if (existing.length > 0) {
      await db
        .update(siteRatings)
        .set({ rating })
        .where(eq(siteRatings.ipHash, ipHash));
    } else {
      await db
        .insert(siteRatings)
        .values({ rating, ipHash });
    }

    const result = await db
      .select({
        average: avg(siteRatings.rating),
        total: count(),
      })
      .from(siteRatings);

    const row = result[0];
    return Response.json({
      average: row.average ? parseFloat(String(row.average)) : 0,
      total: row.total || 0,
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {};
