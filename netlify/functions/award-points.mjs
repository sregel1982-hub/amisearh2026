import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";

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

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const { reason } = body;

  if (!reason || !["document_upload", "corrected_note"].includes(reason)) {
    return new Response(JSON.stringify({ error: "Invalid reason" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const pointsToAdd = 20;

  const updatedRows = await db
    .update(userProfiles)
    .set({
      points: sql`${userProfiles.points} + ${pointsToAdd}`
    })
    .where(eq(userProfiles.identityId, user.id))
    .returning();

  const updated = updatedRows[0];

  if (!updated) {
    return new Response(JSON.stringify({ error: "Profile not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ points: updated.points }), {
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
