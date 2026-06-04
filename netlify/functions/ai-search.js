import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// Segédfüggvény a Netlify + process.env kompatibilitáshoz
const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({
  apiKey: getEnv("GEMINI_API_KEY")
});

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_ANON_KEY")
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { query } = await req.json().catch(() => ({}));

  if (!query || typeof query !== "string") {
    return new Response(JSON.stringify({ error: "Missing or invalid query" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // 1. Query embedding
    const queryResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: query }] }]
    });

    const queryEmbedding = queryResult.embeddings?.[0]?.values;
    if (!queryEmbedding) {
      throw new Error("Failed to generate embedding");
    }

    // 2. Jegyzetek lekérése
    const { data: notes, error } = await supabase
      .from("jegyzetek")
      .select("id, file_path, text_content, embedding");

    if (error) throw error;
    if (!notes || notes.length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Hasonlóság számítás + rendezés
    const results = notes
      .filter((n) => n.embedding && Array.isArray(n.embedding))
      .map((n) => ({
        ...n,
        similarity: cosineSimilarity(queryEmbedding, n.embedding)
      }))
      .filter((n) => n.similarity > 0.6)           // opcionális: alacsony hasonlóság szűrése
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Search failed:", err);
    return new Response(JSON.stringify({ 
      error: "Search failed", 
      message: err.message 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

function cosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
