// ⚠️ TEMPORARY DIAGNOSTIC FUNCTION — törölhető a hibakeresés után

function envGet(name) {
  if (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get) {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 12) return value.substring(0, 4) + "***";
  return value.substring(0, 8) + "..." + value.substring(value.length - 4);
}

export default async function handler(req) {
  const envCheck = {
    GEMINI_API_KEY: !!envGet("GEMINI_API_KEY"),
    GEMINI_API_KEY_PREFIX: maskValue(envGet("GEMINI_API_KEY")),
    SUPABASE_URL: envGet("SUPABASE_URL") || null,
    SUPABASE_ANON_KEY: !!envGet("SUPABASE_ANON_KEY"),
    SUPABASE_ANON_KEY_PREFIX: maskValue(envGet("SUPABASE_ANON_KEY")),
    SUPABASE_SERVICE_ROLE_KEY: !!envGet("SUPABASE_SERVICE_ROLE_KEY"),
    SERVICE_ROLE_KEY: !!envGet("SERVICE_ROLE_KEY"),
    SUPABASE_JWT_SECRET: !!envGet("SUPABASE_JWT_SECRET"),
    NETLIFY_DB_URL: !!envGet("NETLIFY_DB_URL"),
    NODE_VERSION: process.version
  };

  let authResult = null;
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    const supabaseUrl = envGet("SUPABASE_URL");
    const anonKey = envGet("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !anonKey) {
      authResult = { error: "SUPABASE_URL vagy SUPABASE_ANON_KEY hiányzik" };
    } else {
      let tokenInfo = null;
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
          );
          tokenInfo = {
            iss: payload.iss,
            aud: payload.aud,
            sub: payload.sub,
            email: payload.email,
            exp: payload.exp,
            expiresIn: payload.exp ? `${payload.exp - Math.floor(Date.now() / 1000)} sec` : null,
            isExpired: payload.exp ? payload.exp < Math.floor(Date.now() / 1000) : null
          };
        }
      } catch (e) {
        tokenInfo = { decodeError: e.message };
      }

      try {
        const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${token}`
          }
        });
        const body = await r.text();
        authResult = {
          tokenInfo,
          supabaseStatus: r.status,
          supabaseOk: r.ok,
          supabaseBody: body.substring(0, 300)
        };
      } catch (e) {
        authResult = { tokenInfo, fetchError: e.message };
      }
    }
  } else {
    authResult = { note: "Nincs Authorization header" };
  }

  return new Response(
    JSON.stringify({ envCheck, authResult }, null, 2),
    { headers: { "Content-Type": "application/json" } }
  );
}

export const config = {};
