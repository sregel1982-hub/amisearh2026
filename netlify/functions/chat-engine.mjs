import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { detectLanguage, webSearch } from "./search-utils.mjs";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });

const textStreamResponse = (generator) => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("stream error:", err);
        controller.error(err);
      }
    }
  }), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" }
  });
};

async function getSupabaseUser(req) {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

export default async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }

    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const message = String(body.message || body.query || "").trim();
    if (!message) return jsonResponse({ error: "Missing message" }, 400);

    const lang = await detectLanguage(message);
    const web = await webSearch(message, lang);

    const prompt = `Answer in the user's language.

Question:
${message}

${web ? `Web:
${web.summary}` : ""}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      systemInstruction: "You are an educational assistant. Answer clearly.",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    });

    async function* generator() {
      for await (const chunk of stream) {
        if (chunk?.text) yield chunk.text;
      }
    }

    return textStreamResponse(generator());
  } catch (err) {
    console.error("Fatal error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
