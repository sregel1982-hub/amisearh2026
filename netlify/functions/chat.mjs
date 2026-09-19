import { GoogleGenAI } from "@google/genai";

const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get?.(key));
const hasGemini = !!getEnv("GEMINI_API_KEY");
const hasGroq = !!getEnv("GROQ_API_KEY");

// === KÖTELEZŐ RENDSZERÜZENET — FORRÁSOK + LaTeX ===
const SYSTEM_PROMPT = `Te az AMISEARCH megbízható tanulási segítője vagy.

## KÖTELEZŐ SZABÁLYOK:
1. ✅ MINDIG használj külső keresést! Keresd meg a választ hiteles forrásokban: OpenAlex, Wikipédia, oktatási intézmények, tudományos cikkek.
2. ✅ Ne támaszkodj kizárólag belső tudásodra! Ha nincs találat, mondd: "Nem találtam megbízható forrást erről."
3. ✅ Használj LaTeX-et a képletekhez:
   - Sorban: \\(képlet\\)
   - Külön sorban: \\[képlet\\]
4. ✅ Őrizd meg a válasz szerkezetét: összegzés → részletek → képletek → források
5. ✅ Forrás jelölése: 📚 Forrás: [cím](link)`;

const protectLatex = (text) => text
  .replace(/\\\(/g, "__LTMATH_I__")
  .replace(/\\\)/g, "__LTMATH_I_END__")
  .replace(/\\\[/g, "__LTMATH_D__")
  .replace(/\\\]/g, "__LTMATH_D_END__");

const restoreLatex = (text) => text
  .replace(/__LTMATH_I__/g, "\\(")
  .replace(/__LTMATH_I_END__/g, "\\)")
  .replace(/__LTMATH_D__/g, "\\[")
  .replace(/__LTMATH_D_END__/g, "\\]");

export default async (req) => {
  try {
    const { messages = [] } = await req.json();

    if (!hasGemini && !hasGroq) {
      return new Response(JSON.stringify({ error: "Nincs API kulcs" }), { status: 500 });
    }

    const formattedMsgs = messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: protectLatex(m.content || "") }]
    }));

    if (hasGemini) {
      const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });
      const model = ai.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
      });

      const stream = await model.generateContentStream({
        contents: formattedMsgs,
        tools: [{ googleSearchRetrieval: {} }] // 🔍 KERESÉS KÉNYSZERÍTÉSE
      });

      return new Response(
        new ReadableStream({
          async start(ctrl) {
            for await (const chunk of stream.stream) {
              ctrl.enqueue(new TextEncoder().encode(restoreLatex(chunk.text())));
            }
            ctrl.close();
          }
        }),
        { headers: { "Content-Type": "text/plain; charset=utf-8" } }
      );
    }

    if (hasGroq) {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getEnv("GROQ_API_KEY")}`
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages.map(m => ({ role: m.role, content: m.content }))
          ],
          stream: true,
          temperature: 0.2
        })
      });
      return new Response(res.body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};

export const config = { path: "/api/chat" };
