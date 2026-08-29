import { createClient } from "@supabase/supabase-js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env?.get?.(key)) || process.env[key];

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const rateBuckets = new Map();

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server environment variables are missing.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getSupabaseUser(req) {
  try {
    const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
    if (!/^Bearer\s+/i.test(header)) return null;
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch (error) {
    console.error("[security] auth verification failed:", error?.message || error);
    return null;
  }
}

export async function requireUser(req) {
  const user = await getSupabaseUser(req);
  return user || null;
}

export async function readJson(req, maxBytes = 2_000_000) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function rateLimit(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: Math.max(0, limit - 1) };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfter: Math.ceil((existing.resetAt - now) / 1000),
  };
}

export function rateLimitedResponse(result) {
  return json(
    { error: "Túl sok kérés. Próbáld újra később.", code: "rate_limited" },
    429,
    { "Retry-After": String(result.retryAfter || 60) },
  );
}

export function cleanString(value, maxLength = 20_000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export { getEnv };
