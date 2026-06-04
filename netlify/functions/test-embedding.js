import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => 
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

const supabase = createClient(
  getEnv("SUPABASE_URL"),
  getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SERVICE_ROLE_KEY")
);

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const testText = "Ez egy teszt jegyzet. Matematika, Gauss, deriválás, integrálás.";

    // 1. Embedding teszt
    const embedResult = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: testText }] }]
    });

    const embedding = embedResult.embeddings?.[0]?.values;

    if (!embedding) {
      throw new Error("Embedding generation failed");
    }

    // 2. Teszt jegyzet beszúrása
    const { data: inserted, error: insertError } = await supabase
      .from("jegyzetek")
      .insert({
        user_id: "d0f8c5e0-5e4a-4b2e-9c1d-8f7a6b5c4d3e", // ideiglenesen egy dummy user_id (később lecseréljük)
        cim: "DIAGNÓZIS TESZT JEGYZET",
        text_content: testText,
        embedding: embedding,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      throw new Error("DB insert failed: " + insertError.message);
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Diagnózis sikeres!",
      noteId: inserted.id,
      embeddingLength: embedding.length
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (err) {
    console.error("Diagnózis hiba:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
