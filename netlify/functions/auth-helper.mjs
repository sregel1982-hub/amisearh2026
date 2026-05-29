import { createClient } from "@supabase/supabase-js";

/**
 * Supabase user lekérése a Bearer token alapján.
 * A SUPABASE_URL és a SERVICE_ROLE_KEY (vagy SUPABASE_SERVICE_ROLE_KEY)
 * env változókat használja.
 */
export async function getSupabaseUser(req) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env.get("SUPABASE_URL")) ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    (typeof Netlify !== "undefined" &&
      (Netlify.env.get("SUPABASE_SERVICE_ROLE_KEY") || Netlify.env.get("SERVICE_ROLE_KEY"))) ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch (e) {
    console.error("getSupabaseUser error:", e);
    return null;
  }
}
