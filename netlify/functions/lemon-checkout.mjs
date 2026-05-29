import { getSupabaseUser } from "./auth-helper.mjs";

/**
 * /.netlify/functions/lemon-checkout?variant=pro_1month|pro_6month
 *
 *  Bejelentkezett user → létrehoz egy LemonSqueezy checkout URL-t és
 *  visszaadja { url } objektumban. A frontend átirányítja a usert oda.
 *
 *  ENV-ben kell:
 *   - LEMON_API_KEY            (lmsq_* — Settings → API)
 *   - LEMON_STORE_ID
 *   - LEMON_VARIANT_ID_PRO_1MONTH
 *   - LEMON_VARIANT_ID_PRO_6MONTH
 */
export default async function handler(req) {
  if (req.method !== "GET" && req.method !== "POST")
    return jerr("Method not allowed", 405);

  const user = await getSupabaseUser(req);
  if (!user) return jerr("Bejelentkezés szükséges.", 401);

  const url = new URL(req.url);
  const variantKey = url.searchParams.get("variant") || "pro_1month";

  const variantMap = {
    pro_1month: process.env.LEMON_VARIANT_ID_PRO_1MONTH,
    pro_6month: process.env.LEMON_VARIANT_ID_PRO_6MONTH
  };
  const variantId = variantMap[variantKey];
  if (!variantId) return jerr("Ismeretlen variant: " + variantKey, 400);

  const apiKey = process.env.LEMON_API_KEY;
  const storeId = process.env.LEMON_STORE_ID;
  if (!apiKey || !storeId) {
    return jerr(
      "LemonSqueezy nincs konfigurálva (hiányzó LEMON_API_KEY / LEMON_STORE_ID env).",
      500
    );
  }

  const payload = {
    data: {
      type: "checkouts",
      attributes: {
        checkout_data: {
          email: user.email || undefined,
          custom: {
            supabase_user_id: String(user.id),
            variant_key: variantKey
          }
        }
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
        variant: { data: { type: "variants", id: String(variantId) } }
      }
    }
  };

  try {
    const resp = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
      method: "POST",
      headers: {
        Accept: "application/vnd.api+json",
        "Content-Type": "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("[lemon-checkout] LS API error:", resp.status, text);
      return jerr(
        "LemonSqueezy hiba (" + resp.status + "): " + text.slice(0, 300),
        502
      );
    }
    const data = await resp.json();
    const checkoutUrl = data?.data?.attributes?.url;
    if (!checkoutUrl) return jerr("LS nem adott checkout URL-t", 502);

    return jok({ url: checkoutUrl, variant: variantKey });
  } catch (e) {
    console.error("[lemon-checkout] fatal:", e?.message);
    return jerr("Szerver hiba: " + (e?.message || String(e)), 500);
  }
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
