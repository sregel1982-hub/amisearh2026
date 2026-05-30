import { getSupabaseUser } from "./auth-helper.mjs";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * /.netlify/functions/award-points
 *  POST { reason }
 *
 *  Reason → pontok hozzárendelése + dedup szabály
 *  - five_star_rating: 50 pont, csak egyszer / user (rated_bonus_claimed)
 *  - document_upload: 20 pont, MINDEN upload-ra (limit: napi max 10 = 200 pont/nap)
 *  - profile_complete: 30 pont, csak egyszer / user
 *
 *  Response: { points: új total, awarded: most adott, plan }
 *
 *  Idempotens DB schema migráció: rated_bonus_claimed, profile_bonus_claimed,
 *  uploads_today_count, uploads_today_date oszlopok auto-add.
 */

let _schemaEnsured = false;
async function ensureSchema() {
  if (_schemaEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS rated_bonus_claimed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS profile_bonus_claimed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS uploads_today_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS uploads_today_date DATE
    `);
    _schemaEnsured = true;
  } catch (e) {
    console.error("[award-points] ensureSchema failed:", e?.message);
  }
}

const REWARDS = {
  five_star_rating: { amount: 50, oneTime: true, flagCol: "ratedBonusClaimed" },
  document_upload: { amount: 20, oneTime: false, dailyLimit: 10 },
  profile_complete: { amount: 30, oneTime: true, flagCol: "profileBonusClaimed" }
};

export default async function handler(req) {
  if (req.method !== "POST") return jerr("Method not allowed", 405);

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Unauthorized", 401);

  await ensureSchema();

  let body;
  try {
    body = await req.json();
  } catch {
    return jerr("Invalid JSON", 400);
  }

  const reason = body?.reason;
  const rule = REWARDS[reason];
  if (!rule) return jerr("Unknown reason: " + reason, 400);

  /* Profil lekérése — automatikus létrehozás, ha nincs */
  let [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.identityId, user.id))
    .limit(1);

  if (!profile) {
    const [created] = await db
      .insert(userProfiles)
      .values({
        identityId: user.id,
        email: user.email || null,
        points: 0,
        plan: "free"
      })
      .returning();
    profile = created;
  }

  /* Dedup ellenőrzés */
  let awarded = 0;
  const updates = {};

  if (rule.oneTime) {
    if (profile[rule.flagCol]) {
      return jok({
        points: profile.points || 0,
        awarded: 0,
        plan: profile.plan,
        message: "Already claimed"
      });
    }
    updates[rule.flagCol] = true;
    awarded = rule.amount;
  } else if (rule.dailyLimit) {
    const today = new Date().toISOString().slice(0, 10);
    const isNewDay = !profile.uploadsTodayDate || profile.uploadsTodayDate.toISOString?.().slice(0, 10) !== today;
    const usedToday = isNewDay ? 0 : (profile.uploadsTodayCount || 0);
    if (usedToday >= rule.dailyLimit) {
      return jok({
        points: profile.points || 0,
        awarded: 0,
        plan: profile.plan,
        message: "Daily limit reached"
      });
    }
    updates.uploadsTodayCount = usedToday + 1;
    updates.uploadsTodayDate = new Date(today);
    awarded = rule.amount;
  }

  if (awarded === 0) {
    return jok({ points: profile.points || 0, awarded: 0, plan: profile.plan });
  }

  const newPoints = (profile.points || 0) + awarded;
  updates.points = newPoints;

  /* Auto-upgrade to pro at 500 pts (csak ha még free) */
  let upgraded = false;
  if (profile.plan === "free" && newPoints >= 500) {
    updates.plan = "pro";
    upgraded = true;
  }

  try {
    await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.identityId, user.id));
  } catch (e) {
    console.error("[award-points] update failed:", e?.message);
    return jerr("DB update error: " + (e?.message || e), 500);
  }

  return jok({
    points: newPoints,
    awarded,
    plan: updates.plan || profile.plan,
    upgraded,
    reason
  });
}

function jok(d, s = 200) {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}
function jerr(m, s = 400) {
  return new Response(JSON.stringify({ error: m }), {
    status: s,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
