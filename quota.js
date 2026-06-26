import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// quotaField lehet: "ai_questions", "uploads", "downloads", "mindmaps", "summaries", "zh_tasks"
export async function checkQuota(userId, quotaField) {
  // 1. Aktív előfizetés lekérése
  const { data: sub, error: subError } = await supabase
    .from("user_subscriptions")
    .select("price_id, status, expires_at")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (subError) {
    console.error("Subscription query error", subError);
    return { allowed: true };
  }

  const now = new Date();
  const isActive =
    sub && sub.expires_at && new Date(sub.expires_at) > now;

  const priceId = isActive ? sub.price_id : "free";

  // 2. Csomag kvótáinak lekérése
  const { data: price, error: priceError } = await supabase
    .from("prices")
    .select("*")
    .eq("id", priceId)
    .maybeSingle();

  if (priceError || !price) {
    console.error("Price query error", priceError);
    return { allowed: true };
  }

  const limit = price[quotaField];

  // 3. Havi usage lekérése
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const { data: usage, error: usageError } = await supabase
    .from("usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (usageError) {
    console.error("Usage query error", usageError);
    return { allowed: true };
  }

  const used = usage ? usage[quotaField] || 0 : 0;

  if (used >= limit) {
    return {
      allowed: false,
      message:
        "Lejárt a free limit. Ha tovább használnád a funkciókat válts pro-ra!",
    };
  }

  return { allowed: true };
}

export async function incrementUsage(userId, quotaField) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10); // YYYY-MM-DD

  const { data: usage, error: usageError } = await supabase
    .from("usage")
    .select("*")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (usageError) {
    console.error("Usage query error", usageError);
    return;
  }

  if (!usage) {
    await supabase.from("usage").insert({
      user_id: userId,
      period_start: periodStart,
      [quotaField]: 1,
    });
  } else {
    await supabase
      .from("usage")
      .update({
        [quotaField]: (usage[quotaField] || 0) + 1,
      })
      .eq("id", usage.id);
  }
}
