import type { Config } from "@netlify/functions";
import { getSupabaseUser } from "./auth-helper.js";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async (req: Request) => {
  const user = await getSupabaseUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "GET") {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    if (!profile) {
      return Response.json({ profile: null });
    }
    return Response.json({ profile });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { fullName, username, status, email } = body;

    if (!fullName || !username || !email) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingUsername = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.username, username));

    if (existingUsername.length > 0 && existingUsername[0].identityId !== user.id) {
      return Response.json({ error: "Username already taken" }, { status: 409 });
    }

    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    if (existing.length > 0) {
      const [updated] = await db
        .update(userProfiles)
        .set({ fullName, username, status: status || "student" })
        .where(eq(userProfiles.identityId, user.id))
        .returning();
      return Response.json({ profile: updated });
    }

    const [profile] = await db
      .insert(userProfiles)
      .values({
        identityId: user.id,
        fullName,
        username,
        status: status || "student",
        email,
        points: 0,
        plan: "Free",
      })
      .returning();

    return Response.json({ profile }, { status: 201 });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {};
