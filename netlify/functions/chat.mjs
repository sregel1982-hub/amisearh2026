// AMISEARCH — GEMINI 2.5 STABIL, TISZTA ESM
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

    const result = await model.generateContentStream({
      contents,
      tools: [{ googleSearchRetrieval: {} }]
    });

    const stream = new ReadableStream({
      async start(ctrl) {
        for await (const chunk of result.stream) {
          ctrl.enqueue(new TextEncoder().encode(chunk.text()));
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
