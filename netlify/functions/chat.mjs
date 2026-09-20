// netlify/functions/chat.mjs - V5.3 - Javított streaming és kép-elválasztás
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
    const notes = (body.notes || "").toString().slice(0, 12000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];

    if (!message) {
      return new Response(JSON.stringify({ error: "Üres kérdés" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const web = await webSearch(message, "hu").catch(() => ({ isTask: false, summary: "", sources: [] }));

    let imgMd = "";
    const hasImageNoun = /(?:k[eé]p(?:et|eket|re|en|nek)?|fot[oó](?:t|kat|k)?|illusztr[aá]ci[oó](?:t|k)?|diagram(?:ot|ok)?|[aá]bra|image|photo|picture|illustration)/i.test(message);
    const hasRequestVerb = /(?:keress|keresd|mutass|mutasd|adj|tal[aá]lj|k[eé]rek|k[eé]rn[eé]k|szeretn[eé]k|akar(?:ok|n[aá]k)?|kell(?:ene)?|k[eé]ne|sz[uü]ks[eé]gem?\s+van|mutatn[aá]l|tudn[aá]l\s+mutatni|l[eé]gy\s+sz[ií]ves|l[eé]csi|show|find|search|give|need|want|please)/i.test(message);
    const wantsImage = hasImageNoun && hasRequestVerb;

    if (wantsImage) {
      try {
        const img = await imageSearch(message);
        if (img?.url) {
          const title = (img.title || "Kép").replace(/[\[\]]/g, "");
          const source = img.source || "Wikimedia Commons";
          const sourceUrl = img.sourceUrl || img.url;
          // Különálló blokk képpel és vízszintes elválasztó vonallal (---)
          imgMd = `![${title}](${img.url})\n\n**${title}**  \n*Forrás:* [${source}](${sourceUrl})\n\n---\n\n`;
        }
      } catch {}
    }

    const notesBlock = notes ? `\n\nA FELHASZNÁLÓ SAJÁT FELTÖLTÖTT JEGYZETE:\n"""\n${notes}\n"""` : "";

    let system = "";
    if (web.isTask) {
      system = `Te AMISEARCH matektanár vagy. FELADATOT kérnek, nem lexikális forrást.
GENERÁLJ egy kétismeretlenes egyenletrendszer feladatot, oldd meg lépésről lépésre.
Formázás: ## Feladat, ## Megoldás, ## Ellenőrzés.
NE mondd hogy "források nem tartalmaznak", mert ez generált feladat.${notesBlock}`;
    } else if (wantsImage) {
      system = `Te AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Használj ## alcímeket külön sorban, üres sor a bekezdések közt, - lista, **félkövér**.
${imgMd ? "A válasz elején már megjelenítettünk egy képet. Folytasd a válaszadást a témáról szövegesen." : "Nem sikerült képet találni ehhez a témához, jelezd ezt röviden, majd válaszolj szövegesen."}
TALÁLT FORRÁSOK: ${web.summary || "nincs"}
A végén: ## Forrásjegyzék valódi URL-ekkel.${notesBlock}`;
    } else {
      system = `Te AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Használj ## alcímeket külön sorban, üres sor a bekezdések közt, - lista, **félkövér**.
TALÁLT FORRÁSOK: ${web.summary || "nincs"}
A végén: ## Forrásjegyzék valódi URL-ekkel.${notesBlock}`;
    }

    const historyText = history.length
      ? history.map(m => `${m.role === "assistant" ? "AI" : "Felhasználó"}: ${m.content || ""}`).join("\n") + "\n\n"
      : "";

    // 2048-ról megemelve 4096-ra, hogy ne vágja le a hosszabb válaszokat
    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: historyText + "Kérdés: " + message }] }],
      config: {
        systemInstruction: system,
        temperature: 0.15,
        maxOutputTokens: 4096
      }
    });

    const enc = new TextEncoder();
    const readable = new ReadableStream({
      async start(c) {
        if (imgMd) {
          c.enqueue(enc.encode(imgMd));
        }
        for await (const ch of stream) {
          if (ch.text) {
            c.enqueue(enc.encode(ch.text));
          }
        }
        c.close();
      }
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Content-Type-Options": "nosniff"
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
