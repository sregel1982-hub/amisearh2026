import { createClient } from "@supabase/supabase-js";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

/**
 * Supabase user lekérése a Bearer token alapján.
 *
 * Fontos: ez szerveroldali Netlify Function kód. A service role kulcs
 * soha nem kerülhet frontend JavaScript fájlba.
 */
export async function getSupabaseUser(req) {
  try {
    const auth = req.headers.get("authorization") || req.headers.get("Authorization");
    if (!auth || !auth.startsWith("Bearer ")) return null;

    const token = auth.slice(7).trim();
    if (!token) return null;

    const supabaseUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("Supabase env vars missing: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE_KEY");
      return null;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;

    return data.user;
  } catch (error) {
    console.error("getSupabaseUser error:", error?.message || error);
    return null;
  }
}

export default { getSupabaseUser };
