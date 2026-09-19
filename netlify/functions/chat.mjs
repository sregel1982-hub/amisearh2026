// AMISEARCH — GEMINI 2.0 STABIL, TISZTA ESM
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key];

const SYSTEM_PROMPT = `Te az AMISEARCH megbízható tanulási segítője vagy.

Szabályok:
1. Keresd a választ külső forrásokban!
2. Képletek: \\(képlet\\) vagy \\[képlet\\]
3. Forrás: 📚 [cím](link)
4. Ne találj ki adatot!`;

export default async (req) => {
  try {
    const body = await req.json();
    const messages = body.messages || [];

    const apiKey = getEnv("GEMINI_API_KEY");
    if (!apiKey) throw new Error("Nincs API kulcs a környezeti változókban (GEMINI_API_KEY)");

    const ai = new GoogleGenAI({ apiKey });

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));

    // Helyes hívás az @google/genai SDK-ban
    const responseStream = await ai.models.generateContentStream({
      model: "gemini-2.0-flash",
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 4096,
        tools: [{ googleSearch: {} }] // Az új SDK-ban 'googleSearch' a helyes eszköz név!
      }
    });

    const stream = new ReadableStream({
      async start(ctrl) {
        for await (const chunk of responseStream) {
          // chunk.text egy tulajdonság, nem függvény!
          const text = chunk.text; 
          if (text) {
            ctrl.enqueue(new TextEncoder().encode(text));
          }
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
