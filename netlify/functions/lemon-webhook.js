import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * Netlify function: lemon-webhook
 * Path: /.netlify/functions/lemon-webhook
 *
 * ENV:
 *  - SUPABASE_URL
 *  - SERVICE_ROLE_KEY   (vagy SUPABASE_SERVICE_ROLE_KEY, ahogy nálad van)
 *  - LEMON_WEBHOOK_SECRET
 */

export async function handler(event, context) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: "Method not allowed"
    };
  }

  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lemon-webhook] Missing LEMON_WEBHOOK_SECRET");
    return {
      statusCode: 500,
      body: "Server misconfig"
    };
  }

  // 1) RAW BODY
  const rawBody = event.body || "";
  const headers = event.headers || {};
  const signatureHeader =
    headers["x-signature"] ||
    headers["X-Signature"] ||
    headers["x-signature".toLowerCase()] ||
    "";

  // 2) HMAC ellenőrzés
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const computed = hmac.digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    console.warn("[lemon-webhook] Invalid signature");
    return {
      statusCode: 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid signature" })
    };
  }

  // 3) JSON parse
  let body;
  try {
    body = JSON.parse(rawBody);
  } catch (e) {
    console.error("[lemon-webhook] Invalid JSON:", e.message);
    return {
      statusCode: 400,
      body: "Invalid JSON"
    };
  }

  const meta = body.meta || {};
  const eventName =
    meta.event_name ||
    headers["x-event-name"] ||
    headers["X-Event-Name"] ||
    null;

  const customData = meta.custom_data || {};
  const supabaseUserId = customData.supabase_user_id;

  if (!supabaseUserId) {
    console.warn("[lemon-webhook] No supabase_user_id → ignored");
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ignored: true })
    };
  }

  const attrs = body.data?.attributes || {};

  // 4) Esemény → új plan
  let newPlan = null;
  let newExpiresAt = null;

  if (
    eventName === "subscription_created" ||
    eventName === "subscription_payment_success" ||
    eventName === "subscription_resumed" ||
    eventName === "order_created"
  ) {
    newPlan = "pro";
    if (attrs.renews_at) newExpiresAt = attrs.renews_at;
    else if (attrs.ends_at) newExpiresAt = attrs.ends_at;
  } else if (
    eventName === "subscription_cancelled" ||
    eventName === "subscription_expired"
  ) {
    if (attrs.ends_at) {
      newPlan = "pro";
      newExpiresAt = attrs.ends_at;
    } else {
      newPlan = "free";
      newExpiresAt = null;
    }
  } else {
    console.log("[lemon-webhook] Ignored event:", eventName);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, ignored: eventName })
    };
  }

  // 5) Supabase service role kliens
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 6) Supabase update
  try {
    const updateData = {
      plan: newPlan,
      plan_expires_at: newExpiresAt,
      ls_subscription_id: attrs.subscription_id || body.data?.id || null,
      ls_customer_id: attrs.customer_id || null
    };

    const { error } = await supabase
      .from("user_profiles")
      .update(updateData)
      .eq("identity_id", supabaseUserId);

    if (error) {
      console.error("[lemon-webhook] Supabase update failed:", error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "DB update failed" })
      };
    }

    console.log(
      "[lemon-webhook] Updated user",
      supabaseUserId,
      "→",
      newPlan,
      "expires:",
      newExpiresAt
    );
  } catch (e) {
    console.error("[lemon-webhook] Fatal:", e.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Fatal error" })
    };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, plan: newPlan })
  };
}
