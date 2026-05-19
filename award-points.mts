import type { Config } from "@netlify/functions";
import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";

export default async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await req.json();
  const { reason } = body;

  if (!reason || !["document_upload", "corrected_note"].includes(reason)) {
    return Response.json({ error: "Invalid reason" }, { status: 400 });
  }

  const pointsToAdd = 20;

  const [updated] = await db
    .update(userProfiles)
    .set({
      points: sql`${userProfiles.points} + ${pointsToAdd}`,
    })
    .where(eq(userProfiles.identityId, user.id))
    .returning();

  if (!updated) {
    return Response.json({ error: "Profile not found" }, { status: 404 });
  }

  return Response.json({ points: updated.points });
};

export const config: Config = {};
