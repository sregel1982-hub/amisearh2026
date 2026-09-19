// netlify/functions/chat.mjs — AMISEARCH ✅ TELJES, MŰKÖDŐ, FORRÁSOKKAL
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key];

// === RENDSZERÜZENET — FORRÁSOK + KERESÉS + SZERKEZET ===
const SYSTEM_PROMPT = `Te az AMISEARCH megbízható, tudományos tanulási segítője vagy.

## KÖTELEZŐ SZABÁLYOK:

1. 🔍 KERESS KÜLSŐ FORRÁSOKBAN — OpenAlex, Wikipédia, hivatalos tankönyvek, egyetemi kiadványok, szakkönyvek, folyóiratcikkek.
2. 📚 FORRÁS MEGJELÖLÉSE:
   📚 [Szerző: Cím] — Kiadó, Év. Oldal: X–Y. oldal
   📚 [Cím] — Intézmény, Év. Elérhető: [link]
3. ⚠️ CSAK VALÓS ADATOT! Ha nincs forrás: "Jelenleg nem találtam hiteles forrást erről." NE TALÁLJ KI SEMMIT!
4. 📐 Képletek: \\(képlet\\) vagy \\[képlet\\]
5. 🇭🇺 Magyar források előnyben!`;

export default async (req) => {
  try {
    const { messages = [] } = await req.json();

    const apiKey = getEnv("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Nincs GEMINI_API_KEY beállítva" }), { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    });

    const contents = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content || "" }]
    }));

    const result = await model.generateContentStream({
      contents,
      tools: [{ googleSearchRetrieval: {} }] // 🔍 Külső keresés bekapcsolva
    });

    const stream = new ReadableStream({
      async start(controller) {
        for await (const chunk of result.stream) {
          const szoveg = chunk.text();
          if (szoveg) controller.enqueue(new TextEncoder().encode(szoveg));
        }
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache"
      }
    });

  } catch (hiba) {
    console.error("❌ Chat hiba:", hiba);
    return new Response(
      JSON.stringify({ error: hiba.message || "Ismeretlen hiba" }),
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/chat"
};
