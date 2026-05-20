import type { Context, Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { text } = await req.json().catch(() => ({}));

  if (!text || typeof text !== "string") {
    return new Response(JSON.stringify({ error: "Text is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Gemini embedding API
    const result = await ai.models.embedContent({
      model: "gemini-embedding-exp",
      contents: text,
    });

    const embedding = result.embeddings?.[0]?.values;

    return new Response(JSON.stringify({ embedding }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return new Response(JSON.stringify({ error: "Embedding failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {};
