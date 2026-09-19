// netlify/functions/chat.mjs - V5.1 - TISZTA, NINCS DUPLIKÁCIÓ
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = (body.message || "").toString().slice(0, 4000);
    if (!message) {
      return new Response(JSON.stringify({ error: "Üres kérdés" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const web = await webSearch(message, "hu");

    let imgMd = "";
    if (/kép|fotó|templom|korona|pécs|ford|felvilágosodás|image|photo/i.test(message)) {
      try {
        const img = await imageSearch(message);
        if (img?.url) imgMd = `![${(img.title || "Kép").replace(/\]/g, "")}](${img.url})\n*Forrás: ${img.source} – ${img.sourceUrl}*\n\n`;
      } catch {}
    }

    let system = "";
    if (web.isTask) {
      system = `Te AMISEARCH matektanár vagy. FELADATOT kérnek, nem lexikális forrást.
GENERÁLJ egy kétismeretlenes egyenletrendszer feladatot, oldd meg lépésről lépésre.
Formázás: ## Feladat, ## Megoldás, ## Ellenőrzés.
NE mondd hogy "források nem tartalmaznak", mert ez generált feladat.`;
    } else {
      system = `Te AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Használj ## alcímeket külön sorban, üres sor a bekezdések közt, - lista, **félkövér**.
${imgMd ? "Kép már beillesztve a válasz elejére." : ""}
TALÁLT FORRÁSOK: ${web.summary || "nincs"}
A végén: ## Forrásjegyzék valódi URL-ekkel, soha ne írd hogy "belső adatbázis".`;
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: { systemInstruction: system }
    });

    const enc = new TextEncoder();
    const readable = new ReadableStream({
      async start(c) {
        if (imgMd) c.enqueue(enc.encode(imgMd));
        for await (const ch of stream) {
          if (ch.text) c.enqueue(enc.encode(ch.text));
        }
        c.close();
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache"
      }
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
};
