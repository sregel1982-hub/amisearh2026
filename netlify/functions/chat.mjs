// AMISEARCH — TESZT: CSAK ALAP, KERESÉS NÉLKÜL
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key];

// RÖVID, BIZTONSÁGOS ÜZENET — NINCS ÖSSZETETT FORMÁTUM
const SYSTEM_PROMPT = `Te az AMISEARCH tanulási segítője vagy. Mindig keress külső forrásokban, és jelöld meg őket: 📚 Cím — Kiadó, Év. Ne találj ki adatot!`;

export default async (req) => {
  try {
    const { messages = [] } = await req.json();
    const apiKey = getEnv("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Nincs API kulcs");

    const ai = new GoogleGenAI({ apiKey });
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
    });

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));

    // ELŐSZÖR KERESÉS NÉLKÜL — HA MEGY, ADJUK HOZZÁ FOKOZATOSAN
    const result = await model.generateContentStream({
      contents
    });

    const stream = new ReadableStream({
      async start(ctrl) {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) ctrl.enqueue(new TextEncoder().encode(text));
        }
        ctrl.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (err) {
    console.error("HIBA:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const config = { path: "/api/chat" };
