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

  // -------------------------
  // GET → profil lekérése
  // -------------------------
  if (req.method === "GET") {
    const rows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    const profile = rows[0] || null;

    return new Response(JSON.stringify({ profile }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // -------------------------
  // POST → profil létrehozása / frissítése
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

    const { fullName, username, status, email } = body;

    if (!fullName || !username || !email) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Ellenőrzés: foglalt‑e a username
    const existingUsername = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.username, username));

    if (
      existingUsername.length > 0 &&
      existingUsername[0].identityId !== user.id
    ) {
      return new Response(
        JSON.stringify({ error: "Username already taken" }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // Ellenőrzés: van‑e már profil
    const existing = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.identityId, user.id));

    // Profil frissítése
    if (existing.length > 0) {
      const updatedRows = await db
        .update(userProfiles)
        .set({
          fullName,
          username,
          status: status || "student"
        })
        .where(eq(userProfiles.identityId, user.id))
        .returning();

      const updated = updatedRows[0];

      return new Response(JSON.stringify({ profile: updated }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Új profil létrehozása
    const insertedRows = await db
      .insert(userProfiles)
      .values({
        identityId: user.id,
        fullName,
        username,
        status: status || "student",
        email,
        points: 0,
        plan: "Free"
      })
      .returning();

    const profile = insertedRows[0];

    return new Response(JSON.stringify({ profile }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  }

  // -------------------------
  // Minden más HTTP metódus tiltva
  // -------------------------
  return new Response("Method not allowed", { status: 405 });
}

export const config = {};

