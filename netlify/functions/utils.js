import { createClient } from "@supabase/supabase-js";

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export function corsOptionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}

export function textStreamResponse(generator) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            if (chunk) controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.error(err);
        }
      }
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*"
      }
    }
  );
}

export function singleChunkStream(text) {
  async function* gen() {
    yield text;
  }
  return textStreamResponse(gen());
}

export function cleanText(value, max = 70000) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

export function latexToUnicode(text) {
  if (!text) return text;
  return String(text)
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\delta/g, "δ")
    .replace(/\\epsilon/g, "ε")
    .replace(/\\theta/g, "θ")
    .replace(/\\lambda/g, "λ")
    .replace(/\\mu/g, "μ")
    .replace(/\\pi/g, "π")
    .replace(/\\rho/g, "ρ")
    .replace(/\\sigma/g, "σ")
    .replace(/\\tau/g, "τ")
    .replace(/\\phi/g, "φ")
    .replace(/\\omega/g, "ω")
    .replace(/\\infty/g, "∞")
    .replace(/\\sum/g, "∑")
    .replace(/\\prod/g, "∏")
    .replace(/\\int/g, "∫")
    .replace(/\\pm/g, "±")
    .replace(/\\times/g, "×")
    .replace(/\\div/g, "÷")
    .replace(/\\leq/g, "≤")
    .replace(/\\geq/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\sqrt\{([^}]+)\}/g, "√($1)")
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)")
    .replace(/\$\$([^$]+)\$\$/g, "$1")
    .replace(/\$([^$]+)\$/g, "$1")
    .replace(/\\\[(.+?)\\\]/gs, "$1")
    .replace(/\\\((.+?)\\\)/gs, "$1");
}

export async function getSupabaseUser(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    return null;
  }
}
