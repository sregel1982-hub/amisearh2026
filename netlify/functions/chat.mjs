// netlify/functions/chat.mjs - V5.2 - szélesebb képkérés-felismerés (kellene/kéne/stb.)
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
    const web = await webSearch(message, "hu").catch(() => ({ isTask: false, summary: "", sources: [] }));

    let imgMd = "";
    // Kép-főnév jelenléte a szövegben
    const hasImageNoun = /(?:k[eé]p(?:et|eket|re|en|nek)?|fot[oó](?:t|kat|k)?|illusztr[aá]ci[oó](?:t|k)?|diagram(?:ot|ok)?|[aá]bra|image|photo|picture|illustration)/i.test(message);
    // Kérő ige/módosítószó - bővítve: kellene/kéne/szükségem van/mutatnál/stb.
    const hasRequestVerb = /(?:keress|keresd|mutass|mutasd|adj|tal[aá]lj|k[eé]rek|k[eé]rn[eé]k|szeretn[eé]k|akar(?:ok|n[aá]k)?|kell(?:ene)?|k[eé]ne|sz[uü]ks[eé]gem?\s+van|mutatn[aá]l|tudn[aá]l\s+mutatni|l[eé]gy\s+sz[ií]ves|l[eé]csi|show|find|search|give|need|want|please)/i.test(message);
    const wantsImage = hasImageNoun && hasRequestVerb;

    if (wantsImage) {
      try {
        const img = await imageSearch(message);
        if (img?.url) {
          const title = (img.title || "Kép").replace(/[\[\]]/g, "");
          const source = img.source || "Wikimedia Commons";
          const sourceUrl = img.sourceUrl || img.url;
          imgMd = `![${title}](${img.url})\n\n**${title}**  \nForrás: ${source}  \n[Forrás megnyitása](${sourceUrl})\n\n`;
        }
      } catch {}
    }

    let system = "";
    if (web.isTask) {
      system = `Te AMISEARCH matektanár vagy. FELADATOT kérnek, nem lexikális forrást.
GENERÁLJ egy kétismeretlenes egyenletrendszer feladatot, oldd meg lépésről lépésre.
Formázás: ## Feladat, ## Megoldás, ## Ellenőrzés.
NE mondd hogy "források nem tartalmaznak", mert ez generált feladat.`;
    } else if (wantsImage) {
      system = `Te AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Használj ## alcímeket külön sorban, üres sor a bekezdések közt, - lista, **félkövér**.
${imgMd ? "Egy kép már be van illesztve a válasz elejére, erre NE hivatkozz úgy, hogy \"nem tudok képet mutatni\" — a kép már ott van, csak folytasd a szöveges magyarázatot a témáról." : "Nem sikerült képet találni ehhez a témához, ezt jelezd röviden, majd válaszolj szövegesen a kérdésre."}
TALÁLT FORRÁSOK: ${web.summary || "nincs"}
A végén: ## Forrásjegyzék valódi URL-ekkel, soha ne írd hogy "belső adatbázis".`;
    } else {
      system = `Te AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Használj ## alcímeket külön sorban, üres sor a bekezdések közt, - lista, **félkövér**.
TALÁLT FORRÁSOK: ${web.summary || "nincs"}
A végén: ## Forrásjegyzék valódi URL-ekkel, soha ne írd hogy "belső adatbázis".`;
    }

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: message }] }],
      config: {
        systemInstruction: system,
        temperature: 0.15,
        maxOutputTokens: 2048
      }
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
