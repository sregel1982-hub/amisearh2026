import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

/**
 * /.netlify/functions/lemon-webhook
 *
 *  - HMAC-SHA256 aláírás ellenőrzés (LEMON_WEBHOOK_SECRET)
 *  - meta.custom_data.supabase_user_id → Supabase user_profiles.user_id
 *  - subscription_created / payment_success / order_created → plan='pro'
 *  - subscription_cancelled / expired → plan='free'
 *
 *  ENV:
 *    SUPABASE_URL
 *    SUPABASE_SERVICE_ROLE_KEY
 *    LEMON_WEBHOOK_SECRET
 */

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const secret = process.env.LEMON_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lemon-webhook] Missing LEMON_WEBHOOK_SECRET");
    return new Response("Server misconfig", { status: 500 });
  }

  // 1) RAW BODY (HMAC-hoz kötelező)
  const rawBody = await req.text();
  const signatureHeader =
    req.headers.get("x-signature") || req.headers.get("X-Signature") || "";

  // 2) HMAC ellenőrzés
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(rawBody, "utf8");
  const computed = hmac.digest("hex");

  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  const valid = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!valid) {
    console.warn("[lemon-webhook] Invalid signature");
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 3) JSON parse
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

  if (!supabaseUserId) {
    console.warn("[lemon-webhook] No supabase_user_id → ignored");
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
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
    if (attrs.renews_at) newExpiresAt = new Date(attrs.renews_at);
    else if (attrs.ends_at) newExpiresAt = new Date(attrs.ends_at);
  } else if (
    eventName === "subscription_cancelled" ||
    eventName === "subscription_expired"
  ) {
    if (attrs.ends_at) {
      newPlan = "pro";
      newExpiresAt = new Date(attrs.ends_at);
    } else {
      newPlan = "free";
      newExpiresAt = null;
    }
  } else {
    return new Response(JSON.stringify({ ok: true, ignored: eventName }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // 5) Supabase service role kliens
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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
      .eq("user_id", supabaseUserId);

    if (error) {
      console.error("[lemon-webhook] Supabase update failed:", error);
      return new Response(JSON.stringify({ error: "DB update failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
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
    console.error("[lemon-webhook] Fatal:", e?.message);
    return new Response(JSON.stringify({ error: "Fatal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ ok: true, plan: newPlan }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

// RAW body kell → Netlify ne parse-olja
export const config = {};
