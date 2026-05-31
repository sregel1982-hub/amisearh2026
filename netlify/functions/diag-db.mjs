import { neon } from "@netlify/neon";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as drizzleSql } from "drizzle-orm";

/**
 * /.netlify/functions/diag-db
 *
 *  GET — diagnosztika az adatbázis kapcsolatról és sémáról.
 *  - Ellenőrzi van-e NETLIFY_DATABASE_URL
 *  - Lefut egy SELECT 1
 *  - Megnézi az uploaded_notes oszlopait
 *  - Lefut egy ALTER TABLE ADD COLUMN IF NOT EXISTS
 */
export default async function handler(req) {
  const result = {
    env: {
      NETLIFY_DATABASE_URL: !!process.env.NETLIFY_DATABASE_URL,
      NETLIFY_DB_URL: !!process.env.NETLIFY_DB_URL,
      DATABASE_URL: !!process.env.DATABASE_URL
    },
    steps: []
  };

  let sql;
  try {
    sql = neon();
    result.steps.push({ name: "neon() init", ok: true });
  } catch (e) {
    result.steps.push({ name: "neon() init", ok: false, error: e?.message });
    return jres(result);
  }

  let db;
  try {
    db = drizzle(sql);
    result.steps.push({ name: "drizzle() init", ok: true });
  } catch (e) {
    result.steps.push({ name: "drizzle() init", ok: false, error: e?.message });
    return jres(result);
  }

  /* Test 1: simple SELECT 1 */
  try {
    const r = await db.execute(drizzleSql`SELECT 1 as one`);
    result.steps.push({ name: "SELECT 1", ok: true, rows: r?.rows ?? r });
  } catch (e) {
    result.steps.push({ name: "SELECT 1", ok: false, error: e?.message, stack: e?.stack?.split("\n").slice(0, 5) });
  }

  /* Test 2: list columns of uploaded_notes */
  try {
    const r = await db.execute(drizzleSql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'uploaded_notes'
      ORDER BY ordinal_position
    `);
    result.steps.push({ name: "uploaded_notes columns", ok: true, columns: (r?.rows || r || []).map((row) => row.column_name) });
  } catch (e) {
    result.steps.push({ name: "uploaded_notes columns", ok: false, error: e?.message });
  }

  /* Test 3: ALTER TABLE ADD COLUMN IF NOT EXISTS */
  try {
    await db.execute(drizzleSql`
      ALTER TABLE uploaded_notes
        ADD COLUMN IF NOT EXISTS title TEXT,
        ADD COLUMN IF NOT EXISTS subject TEXT,
        ADD COLUMN IF NOT EXISTS language TEXT,
        ADD COLUMN IF NOT EXISTS file_hash TEXT,
        ADD COLUMN IF NOT EXISTS text_hash TEXT,
        ADD COLUMN IF NOT EXISTS shingle_signature JSONB,
        ADD COLUMN IF NOT EXISTS plagiarism_score INTEGER,
        ADD COLUMN IF NOT EXISTS similar_note_ids JSONB
    `);
    result.steps.push({ name: "ALTER uploaded_notes", ok: true });
  } catch (e) {
    result.steps.push({ name: "ALTER uploaded_notes", ok: false, error: e?.message });
  }

  /* Test 4: ALTER user_profiles */
  try {
    await db.execute(drizzleSql`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS ls_customer_id TEXT,
        ADD COLUMN IF NOT EXISTS rated_bonus_claimed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS profile_bonus_claimed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS uploads_today_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS uploads_today_date DATE
    `);
    result.steps.push({ name: "ALTER user_profiles", ok: true });
  } catch (e) {
    result.steps.push({ name: "ALTER user_profiles", ok: false, error: e?.message });
  }

  return jres(result);
}

function jres(d) {
  return new Response(JSON.stringify(d, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export const config = {};
