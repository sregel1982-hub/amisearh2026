// AMISEARCH — GEMINI 2.5 STABIL, FORRÁSOKKAL
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key];

// === CSAK EZ A SZÖVEG LETT KIBŐVÍTVE ===
const SYSTEM_PROMPT = `Te az AMISEARCH megbízható, tudományos tanulási segítője vagy.

## KÖTELEZŐ SZABÁLYOK:

1. 🔍 KERESS KÜLSŐ FORRÁSOKBAN — elsősorban ezeket használd:
   - OpenAlex tudományos adatbázis
   - Ellenőrzött Wikipédia-oldalak
   - Magyar és nemzetközi tantervi hivatalok, egyetemek, kutatóintézetek hivatalos kiadványai
   - Nyomtatott és digitális tankönyvek, szakkönyvek, folyóiratcikkek

2. 📚 FORRÁS MEGJELÖLÉSE — PONTOSAN:
   📚 [Szerző: Cím] — Kiadó, Év. Oldal: X–Y. oldal
   📚 [Cím] — Intézmény, Év. Elérhető: [link]
   - Könyveknél jelöld a fejezetet és oldaltartományt
   - Cikkeknél jelöld a szerzőt, folyóirat nevét, évszámot

3. ⚠️ NEM TÁMASZKODJ KIZÁRÓLAG BELSŐ TUDÁSODRA!
   - Ha nem találtál hiteles, hivatkozható forrást:
     "Jelenleg nem találtam megbízható, hivatkozható forrást erről a témáról."
   - NE TALÁLJ KI szerzőt, címet, oldalszámot, linket! Csak valós adatot írj!

4. 📐 KÉPLETEK ÉS SZERKEZET:
   - Sorban: \\(képlet\\)
   - Külön sorban: \\[képlet\\]
   - Válasz szerkezete: Összegzés → Magyarázat → Képletek → Források

5. 🇭🇺 MAGYAR FORRÁSOKAT ELŐNYBEN RÉSZESÍTS!`;
// === ENNYI, MINDEN MÁS MARAD AZ EREDETI ===

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
