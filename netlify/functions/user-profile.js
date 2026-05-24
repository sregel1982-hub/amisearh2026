import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async function handler(req) {
  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "GET") {
    const rows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    return new Response(JSON.stringify({ profile: rows[0] || null }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }

    const { fullName, username, status, email } = body;

    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    if (existing.length > 0) {
      const updated = await db
        .update(userProfiles)
        .set({ fullName, username, status: status || "student" })
        .where(eq(userProfiles.identityId, user.id))
        .returning();
      return new Response(JSON.stringify({ profile: updated[0] }));
    } else {
      const inserted = await db
        .insert(userProfiles)
        .values({
          identityId: user.id,
          fullName: fullName || (user.email || "User"),
          username: username || (user.email?.split("@")[0] || "user_" + Date.now()),
          email: email || user.email || "",
          status: status || "student",
          points: 0,
          plan: "Free"
        })
        .returning();
      return new Response(JSON.stringify({ profile: inserted[0] }), { status: 201 });
    }
  }
  return new Response("Method not allowed", { status: 405 });
}

export const config = {};
