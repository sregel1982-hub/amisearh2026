import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/genai";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_API_KEY);

export default async (req, context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { query, userId, limit = 5 } = await req.json();

    if (!query || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing query or userId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // 1. Generate embedding for the query
    const model = genAI.getGenerativeModel({
      model: "text-embedding-004",
    });

    const queryEmbedding = await model.embedContent(query);
    const queryVector = queryEmbedding.embedding.values;

    // 2. Query similar notes from Supabase using vector search
    const { data: notes, error } = await supabase.rpc(
      "match_uploaded_notes",
      {
        query_embedding: queryVector,
        match_threshold: 0.6,
        match_count: limit,
        user_id_filter: userId,
      }
    );

    if (error) {
      console.error("Vector search error:", error);
      return new Response(
        JSON.stringify({ error: "Vector search failed", details: error }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ success: true, notes: notes || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Query embeddings error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};