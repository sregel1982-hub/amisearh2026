import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq } from "drizzle-orm";

const POINTS_PER_REASON = {
  document_upload: 20,
  corrected_note: 20,
  five_star_rating: 50
};

const PRO_THRESHOLD = 500;

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
  const pointsToAdd = POINTS_PER_REASON[reason];

  if (!pointsToAdd) {
    return new Response(JSON.stringify({ error: "Invalid reason" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Profil automatikus létrehozása, ha még nincs
  let existing = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.identityId, user.id));

  if (existing.length === 0) {
    const inserted = await db
      .insert(userProfiles)
      .values({
        identityId: user.id,
        fullName: user.email || "User",
        username: (user.email && user.email.split("@")[0]) || ("user_" + Date.now()),
        email: user.email || "",
        status: "student",
        points: 0,
        plan: "Free"
      })
      .returning();
    existing = inserted;
  }

  const currentProfile = existing[0];
  const newPoints = (currentProfile.points || 0) + pointsToAdd;
  let finalPoints = newPoints;
  let finalPlan = currentProfile.plan || "Free";

  // 500 pont elérése: nullázás + Pro plan
  let upgraded = false;
  if (newPoints >= PRO_THRESHOLD) {
    finalPoints = 0;
    finalPlan = "Pro";
    upgraded = true;
  }

  const updatedRows = await db
    .update(userProfiles)
    .set({ points: finalPoints, plan: finalPlan })
    .where(eq(userProfiles.identityId, user.id))
    .returning();

  const updated = updatedRows[0];

  return new Response(
    JSON.stringify({
      points: updated.points,
      plan: updated.plan,
      upgraded
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

export const config = {};
  
