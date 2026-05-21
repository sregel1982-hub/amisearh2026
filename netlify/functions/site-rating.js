import { db } from "../../db/index.js";
import { siteRatings } from "../../db/schema.js";
import { eq, avg, count } from "drizzle-orm";

function hashIP(ip) {
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return "ip_" + Math.abs(hash).toString(36);
}

export default async function handler(req) {
  // -------------------------
  // GET → átlag + darabszám lekérése
  // -------------------------
  if (req.method === "GET") {
    const result = await db
      .select({
        average: avg(siteRatings.rating),
        total: count()
      })
      .from(siteRatings);

    const row = result[0];

    return new Response(
      JSON.stringify({
        average: row.average ? parseFloat(String(row.average)) : 0,
        total: row.total || 0
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // -------------------------
  // POST → értékelés mentése / frissítése
  // -------------------------
  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { rating } = body;

    if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
      return new Response(
        JSON.stringify({ error: "Rating must be between 1 and 5" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // IP hash
    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    const ipHash = hashIP(clientIP);

    // Ellenőrzés: értékelt-e már
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

    // Új átlag lekérése
    const result = await db
      .select({
        average: avg(siteRatings.rating),
        total: count()
      })
      .from(siteRatings);

    const row = result[0];

    return new Response(
      JSON.stringify({
        average: row.average ? parseFloat(String(row.average)) : 0,
        total: row.total || 0
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // -------------------------
  // Minden más HTTP metódus tiltva
  // -------------------------
  return new Response("Method not allowed", { status: 405 });
}

export const config = {};

