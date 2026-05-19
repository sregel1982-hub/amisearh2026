export interface SupabaseJwtPayload {
  sub: string;
  email?: string;
  exp?: number;
  aud?: string;
  role?: string;
}

export async function getSupabaseUser(
  req: Request,
): Promise<{ id: string; email?: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  const jwtSecret =
    getEnv("SUPABASE_JWT_SECRET") ||
    getEnv("SUPABASEJWTSECRET") ||
    getEnv("SUPABASE_JWT");

  if (jwtSecret) {
    try {
      const payload = await verifyJwt(token, jwtSecret);
      if (!payload || !payload.sub) {
        return null;
      }
      return { id: payload.sub, email: payload.email };
    } catch {
      return null;
    }
  }

  return getUserFromSupabase(token);
}

function getEnv(name: string): string | undefined {
  return Netlify.env.get(name) || process.env[name] || undefined;
}

async function getUserFromSupabase(
  token: string,
): Promise<{ id: string; email?: string } | null> {
  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey =
    getEnv("SUPABASE_ANON_KEY") ||
    getEnv("VITE_SUPABASE_ANON_KEY") ||
    getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !anonKey) {
    return null;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const user = await response.json();
    if (!user?.id) {
      return null;
    }

    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}

function base64UrlDecode(str: string): ArrayBuffer {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function verifyJwt(
  token: string,
  secret: string,
): Promise<SupabaseJwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const signatureInput = encoder.encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlDecode(signatureB64);

  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    signatureInput,
  );
  if (!valid) return null;

  const payloadJson = new TextDecoder().decode(base64UrlDecode(payloadB64));
  const payload: SupabaseJwtPayload = JSON.parse(payloadJson);

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
