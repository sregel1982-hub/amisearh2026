import { GoogleGenAI } from "@google/genai";

const getEnv = (key) =>
  (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

export default async function handler(req) {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }

    const body = await req.json().catch(() => ({}));
    const { topic, level, subject, questions = 5, lang = "hu" } = body;

    if (!topic && !subject) {
      return new Response(JSON.stringify({ error: "Téma vagy tantárgy szükséges" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const prompt = `Készíts egy ${questions} kérdésből álló kvízt ${lang === "hu" ? "magyar" : "angol"} nyelven.

Tantárgy: ${subject || "általános"}
Szint: ${level || "közép"}
Téma: ${topic || "általános"}

A válasz LEGYEN CSAK érvényes JSON, semmi más. Formátum:
{
  "quiz": {
    "title": "Kvíz címe",
    "questions": [
      {
        "question": "Kérdés szövege",
        "options": ["A válasz", "B válasz", "C válasz", "D válasz"],
        "correct": 0,
        "explanation": "Magyarázat a helyes válaszhoz"
      }
    ]
  }
}

A correct mező a helyes válasz indexe (0-tól kezdve).`;

    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
        maxOutputTokens: 4000
      }
    });

    const text = result.text || "";
    
    // Kinyerjük a JSON-t a válaszból
    let jsonMatch = text.match(/\{[\s\S]*\}/);
    let quizData;
    
    if (jsonMatch) {
      try {
        quizData = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("JSON parse error:", e);
      }
    }
    
    if (!quizData) {
      // Ha nem sikerült JSON-t kinyerni, próbáljuk meg tisztítani
      const cleanText = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      try {
        quizData = JSON.parse(cleanText);
      } catch (e) {
        console.error("Clean JSON parse error:", e);
      }
    }

    if (!quizData) {
      return new Response(JSON.stringify({ 
        error: "Nem sikerült érvényes kvíz formátumot generálni",
        rawResponse: text.slice(0, 500)
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify(quizData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Quiz generation error:", error);
    return new Response(JSON.stringify({ 
      error: error.message || "Kvíz generálási hiba" 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
