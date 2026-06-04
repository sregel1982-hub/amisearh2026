import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

export default async function handler(req) {
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-001",        // ← Javított modell
      contents: [{ parts: [{ text: "Teszt szöveg matematika Gauss deriválás" }] }]
    });

    const embedding = result.embeddings?.[0]?.values;

    // Teszt insert
    const { data: inserted, error: insertError } = await supabase
      .from("jegyzetek")
      .insert({
        user_id: "00000000-0000-0000-0000-000000000000", // dummy
        cim: "DIAGNÓZIS TESZT",
        text_content: "Teszt jegyzet",
        embedding: embedding,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({
      success: true,
      message: "✅ Embedding és Supabase működik!",
      model: "gemini-embedding-001",
      embeddingLength: embedding?.length || 0,
      noteId: inserted?.id
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Test error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
      
