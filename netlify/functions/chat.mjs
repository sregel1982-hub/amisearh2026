// netlify/functions/chat.mjs — AMISEARCH ✅ GEMINI 2.5 STABIL
import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => 
  process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get?.(key));

const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
if (!GEMINI_API_KEY) console.error("❌ Nincs GEMINI_API_KEY!");

// === KÖTELEZŐ SZABÁLYOK — FORRÁSOK + LaTeX + SZERKEZET ===
const SYSTEM_PROMPT = `Te az AMISEARCH megbízható tanulási segítője vagy.

## KÖTELEZŐEN BETARTANDÓ:
1. 🔍 KERESS KÜLSŐ FORRÁSOKBAN: OpenAlex, Wikipédia, megbízható oktatási/tudományos oldalak!
2. Nem csak saját tudásodra támaszkodj — a válasz alapja MINDIG talált, ellenőrzött tartalom legyen.
3. Ha nem találsz megbízható információt: "Jelenleg nem találtam hiteles forrást erről."
4. Képletek:
   - sorban: \\(képlet\\)
   - külön sorban: \\[képlet\\]
5. Szerkezet: Összegzés → Részletek → Képletek → 📚 Forrás: [cím](link)
6. Ne változtasd meg a felhasználó által küldött szöveg szerkezetét!`;

// LaTeX védelem — hogy ne sérüljön átvitel közben
const vedLatex = szoveg => szoveg
  .replace(/\\\(/g, "__LT_I__")
  .replace(/\\\)/g, "__LT_I_VEGE__")
  .replace(/\\\[/g, "__LT_K__")
  .replace(/\\\]/g, "__LT_K_VEGE__");

const allitVisszaLatex = szoveg => szoveg
  .replace(/__LT_I__/g, "\\(")
  .replace(/__LT_I_VEGE__/g, "\\)")
  .replace(/__LT_K__/g, "\\[")
  .replace(/__LT_K_VEGE__/g, "\\]");

export default async (req) => {
  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "Nincs API kulcs" }), { status: 500 });
    }

    const { messages = [] } = await req.json();

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    const model = ai.getGenerativeModel({
      model: "gemini-2.5-flash", // ✅ A te kódodban ez van
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4096
      }
    });

    // Üzenetek formázása + LaTeX védelem
    const tartalmak = messages.map(uzenet => ({
      role: uzenet.role === "assistant" ? "model" : "user",
      parts: [{ text: vedLatex(uzenet.content || "") }]
    }));

    // Keresés KÉNYSZERÍTÉSE — külső források
    const valaszFolyam = await model.generateContentStream({
      contents: tartalmak,
      tools: [{ googleSearchRetrieval: {} }] // 🔍 Mindig keres!
    });

    // Visszaküldés — LaTeX helyreállításával
    const stream = new ReadableStream({
      async start(vezerlo) {
        for await (const darab of valaszFolyam.stream) {
          vezerlo.enqueue(
            new TextEncoder().encode(allitVisszaLatex(darab.text()))
          );
        }
        vezerlo.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });

  } catch (hiba) {
    console.error("❌ Chat hiba:", hiba);
    return new Response(
      JSON.stringify({ hiba: hiba.message }),
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/chat"
};
