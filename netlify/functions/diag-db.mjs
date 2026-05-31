import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql as drizzleSql } from "drizzle-orm";

export default async function handler(req) {
  const result = {
    env: {
      NETLIFY_DATABASE_URL: !!process.env.NETLIFY_DATABASE_URL,
      NETLIFY_DB_URL: !!process.env.NETLIFY_DB_URL,
      DATABASE_URL: !!process.env.DATABASE_URL
    },
    steps: []
  };

  const connStr =
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.NEON_DATABASE_URL;

  if (!connStr) {
    result.steps.push({ name: "connection string", ok: false, error: "No env var found" });
    return jres(result);
  }

  let sql;
  try {
    sql = neon(connStr);
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

  try {
    const r = await db.execute(drizzleSql`SELECT 1 as one`);
    result.steps.push({ name: "SELECT 1", ok: true, rows: r?.rows ?? r });
  } catch (e) {
    result.steps.push({ name: "SELECT 1", ok: false, error: e?.message });
  }

  try {
    const r = await db.execute(drizzleSql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'uploaded_notes'
      ORDER BY ordinal_position
    `);
    const cols = (r?.rows || r || []).map((row) => row.column_name);
    result.steps.push({ name: "uploaded_notes columns", ok: true, columns: cols });
  } catch (e) {
    result.steps.push({ name: "uploaded_notes columns", ok: false, error: e?.message });
  }

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




