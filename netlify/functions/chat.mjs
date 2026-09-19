// AMISEARCH — TESZT: CSAK ALAP, KERESÉS NÉLKÜL
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key];

// RÖVID, BIZTONSÁGOS ÜZENET
const SYSTEM_PROMPT = `Te az AMISEARCH tanulási segítője vagy. Mindig keress külső forrásokban, és jelöld meg őket: 📚 Cím — Kiadó, Év. Ne találj ki adatot!`;

export default async (req) => {
  try {
    const { messages = [] } = await req.json();
    const apiKey = getEnv("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Nincs API kulcs megadva a környezeti változókban (GEMINI_API_KEY)");

    const ai = new GoogleGenAI({ apiKey });

    // Üzenetek átalakítása az új SDK formátumára
    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));

    // @google/genai SDK szerinti helyes hívás és létező modellnév (gemini-2.0-flash)
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });

    const stream = new ReadableStream({
      async start(ctrl) {
        for await (const chunk of responseStream) {
          const text = chunk.text; // Az új SDK-ban ez egy tulajdonság (property), nem függvény!
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
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/api/chat" };
