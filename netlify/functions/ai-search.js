import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_ANON_KEY")
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
    // Query embedding
    const queryResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: query }] }]
    });

    const queryEmbedding = queryResult.embeddings?.[0]?.values;
    if (!queryEmbedding) throw new Error("Embedding generation failed");

    // Összes jegyzet lekérése debug célból
    const { data: notes, error } = await supabase
      .from("jegyzetek")
      .select("id, cim, text_content, embedding");

    if (error) throw error;

    const totalNotes = notes?.length || 0;
    const notesWithEmbedding = notes?.filter(n => n.embedding && Array.isArray(n.embedding)).length || 0;

    // Hasonlóság számítás
    const results = notes
      .filter(n => n.embedding && Array.isArray(n.embedding))
      .map(n => ({
        id: n.id,
        cim: n.cim,
        text_preview: n.text_content ? n.text_content.substring(0, 150) + "..." : "",
        similarity: cosineSimilarity(queryEmbedding, n.embedding)
      }))
      .filter(n => n.similarity > 0.6)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return new Response(JSON.stringify({ 
      results,
      debug: {
        totalNotes,
        notesWithEmbedding,
        queryLength: query.length,
        hasResults: results.length > 0
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Search failed:", err);
    return new Response(JSON.stringify({ 
      error: err.message,
      debug: "Hiba történt a keresés során"
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
