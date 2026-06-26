import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { detectLanguage, webSearch, imageSearch } from "./search-utils.mjs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });

const corsOptionsResponse = () =>
  new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });

const cleanText = (v = "", max = 70000) =>
  String(v)
    .replace(/
/g, "
")
    .replace(/
/g, "
")
    .replace(/[ \t]+/g, " ")
    .replace(/
{4,}/g, "


")
    .trim()
    .slice(0, max);

function getSupabaseUser(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  return supabase.auth.getUser(token).then(({ data }) => data?.user || null).catch(() => null);
}

export default async (req) => {
  if (req.method === "OPTIONS") return corsOptionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const user = await getSupabaseUser(req);
  if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

  const quota = await checkQuota(user.id, "ai_questions");
  if (!quota.allowed) {
    return jsonResponse({ error: quota.message || "AI quota exceeded" }, 402);
  }

  const message = cleanText(body.message || body.query || "", 12000);
  if (!message) return jsonResponse({ error: "Missing message" }, 400);

  const lang = await detectLanguage(message);
  const webContext = await webSearch(message, lang);

  await incrementUsage(user.id, "ai_questions");

  const stream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    systemInstruction: `You are the AMISEARCH educational assistant. Answer in the user's language. End with "## Forrásjegyzék".`,
    contents: [{
      role: "user",
      parts: [{
        text: `## QUESTION
${message}

${webContext ? `## WEB
${webContext.summary}` : ""}`
      }]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
  });

  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (chunk?.text) controller.enqueue(encoder.encode(chunk.text));
        }
        controller.close();
      } catch (e) {
        controller.error(e);
      }
    }
  }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
  });
};
