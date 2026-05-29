import crypto from "node:crypto";
import { db } from "../../db/index.js";
import { userProfiles } from "../../db/schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * /.netlify/functions/lemon-webhook
 *
 *  LemonSqueezy webhook fogadása.
 *  - HMAC-SHA256 aláírás ellenőrzés a LEMON_WEBHOOK_SECRET-tel
 *  - meta.custom_data.supabase_user_id → user_profiles.identity_id párosítás
 *  - subscription_created / subscription_payment_success / order_created → plan='pro' + plan_expires_at
 *  - subscription_cancelled / subscription_expired → plan='free'
 *
 *  ENV: LEMON_WEBHOOK_SECRET
 */

let _schemaEnsured = false;
async function ensureSchema() {
  if (_schemaEnsured) return;
  try {
    await db.execute(sql`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS ls_subscription_id TEXT,
        ADD COLUMN IF NOT EXISTS ls_customer_id TEXT
    `);
    _schemaEnsured = true;
  } catch (e) {
    console.error("[lemon-webhook] ensureSchema failed:", e?.message);
  }
}

export default async function handler(req) {
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405 });

  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lemon-webhook] LEMON_WEBHOOK_SECRET missing");
    return new Response("Server misconfig", { status: 500 });
  }

  /* 1) Raw body olvasás (HMAC-hoz a nyers byte-okra van szükség) */
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get("x-signature") || req.headers.get("X-Signature") || "";

  /* 2) HMAC ellenőrzés */
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const computed = hmac.digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!valid) {
    console.warn("[lemon-webhook] invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  /* 3) Body parse */
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const meta = body.meta || {};
  const eventName =
    meta.event_name ||
    req.headers.get("x-event-name") ||
    req.headers.get("X-Event-Name");
  const customData = meta.custom_data || {};
  const supabaseUserId = customData.supabase_user_id;
  const attrs = body.data?.attributes || {};

  if (!supabaseUserId) {
    console.warn("[lemon-webhook] no supabase_user_id in custom_data:", eventName);
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  /* 4) DB schema biztosítás (idempotens) */
  await ensureSchema();

  /* 5) Plan döntés esemény alapján */
  let newPlan = null;
  let newExpiresAt = null;

  if (
    eventName === "subscription_created" ||
    eventName === "subscription_payment_success" ||
    eventName === "subscription_resumed" ||
    eventName === "order_created"
  ) {
    newPlan = "pro";
    if (attrs.renews_at) newExpiresAt = new Date(attrs.renews_at);
    else if (attrs.ends_at) newExpiresAt = new Date(attrs.ends_at);
  } else if (
    eventName === "subscription_cancelled" ||
    eventName === "subscription_expired"
  ) {
    /* Lejár a `renews_at`-kor, addig még pro */
    if (attrs.ends_at) {
      newPlan = "pro";
      newExpiresAt = new Date(attrs.ends_at);
    } else {
      newPlan = "free";
      newExpiresAt = null;
    }
  } else if (eventName === "subscription_payment_failed") {
    /* Hagyjuk pro-n a renews_at-ig, csak logoljunk */
    console.warn("[lemon-webhook] payment failed for", supabaseUserId);
    return new Response(JSON.stringify({ ok: true, noted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } else {
    /* Ismeretlen / nem érdekes esemény — ignorálva */
    return new Response(JSON.stringify({ ok: true, ignored: eventName }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  /* 6) DB update */
  try {
    const updateData = { plan: newPlan };
    if (newExpiresAt) updateData.planExpiresAt = newExpiresAt;
    if (attrs.subscription_id || body.data?.id) {
      updateData.lsSubscriptionId = String(attrs.subscription_id || body.data.id);
    }
    if (attrs.customer_id) {
      updateData.lsCustomerId = String(attrs.customer_id);
    }

    await db
      .update(userProfiles)
      .set(updateData)
      .where(eq(userProfiles.identityId, supabaseUserId));

    console.log(
      "[lemon-webhook] updated",
      supabaseUserId,
      "→",
      newPlan,
      "expires:",
      newExpiresAt
    );
  } catch (e) {
    console.error("[lemon-webhook] db update failed:", e?.message);
    return new Response(JSON.stringify({ error: "DB update failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true, plan: newPlan }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

/* IMPORTANT: a raw body parser kell — disable Netlify default body parsing */
export const config = {};
