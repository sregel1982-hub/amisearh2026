
    import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey:
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY
});

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
    // 1) Embedding a lekérdezéshez
    const queryResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: query }] }]
    });

    const queryEmbedding = queryResult.embeddings?.[0]?.values;
    if (!queryEmbedding) {
      return new Response(JSON.stringify({ error: "Embedding failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 2) Jegyzetek lekérése
    const { data: notes, error } = await supabase
      .from("uploaded_notes")
      .select("id, textContent, embedding");

    if (error) {
      return new Response(JSON.stringify({ error: "DB fetch failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3) Hasonlóság számítás
    const results = notes
      .filter((n) => n.embedding)
      .map((n) => ({
        ...n,
        similarity: cosineSimilarity(queryEmbedding, n.embedding)
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Search failed:", err);
    return new Response(JSON.stringify({ error: "Search failed" }), {
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

export const config = {};
