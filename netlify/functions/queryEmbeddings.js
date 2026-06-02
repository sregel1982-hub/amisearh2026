import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

// Supabase init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query } = await req.json().catch(() => ({}));

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 1) Generate embedding for the query
    const queryResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: query }] }]
    });

    const queryEmbedding = queryResult.embeddings?.[0]?.values;

    if (!queryEmbedding) {
      return new Response(JSON.stringify({ error: "Failed to generate query embedding" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2) Fetch all embeddings from DB
    const { data: notes, error } = await supabase
      .from("uploaded_notes")
      .select("id, file_path, text_content, embedding");

    if (error) {
      return new Response(JSON.stringify({ error: "DB fetch failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3) Cosine similarity
    const results = notes.map((item) => {
      const similarity = cosineSimilarity(queryEmbedding, item.embedding);
      return { ...item, similarity };
    });

    results.sort((a, b) => b.similarity - a.similarity);

    return new Response(JSON.stringify({ results: results.slice(0, 5) }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("Query failed:", error);
    return new Response(JSON.stringify({ error: "Query failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const config = {};
