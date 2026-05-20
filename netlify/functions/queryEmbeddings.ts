import type { Context, Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query, embeddings } = await req.json().catch(() => ({}));

  if (!query || !Array.isArray(embeddings)) {
    return new Response(JSON.stringify({ error: "Invalid input" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Generate query embedding with Gemini
    const queryResult = await ai.models.embedContent({
      model: "gemini-embedding-exp",
      contents: query,
    });

    const queryEmbedding = queryResult.embeddings?.[0]?.values;

    // Simple cosine similarity search
    const results = embeddings.map((item: any) => {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      return { ...item, similarity };
    });

    results.sort((a: any, b: any) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ results: results.slice(0, 5) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Query embedding failed:", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export const config: Config = {};
