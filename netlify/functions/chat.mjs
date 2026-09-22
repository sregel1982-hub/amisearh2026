// netlify/functions/chat.mjs - V5.4 - isTask nem kényszerít matekra
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
          imgMd = `![\( {title}]( \){img.url})\n\n**\( {title}**  \n*Forrás:* [ \){source}](${sourceUrl})\n\n---\n\n`;
        }
      } catch {}
    }

    const notesBlock = notes
      ? `\n\nA FELHASZNÁLÓ SAJÁT FELTÖLTÖTT JEGYZETE:\n"""\n${notes}\n"""`
      : "";

    // Matek-e a kérés? (csak akkor kényszerítünk matek formátumot, ha tényleg az)
    const isMathTopic = /(?:matek|matematika|egyenlet|egyenletrendszer|derivál|integrál|tört|százalék|geometria|algebra|számítás|függvény|határérték|egyenlőtlenség)/i.test(message);

    let system = "";
    if (web.isTask) {
      // JAVÍTÁS: ne generálj mindig kétismeretlenes egyenletrendszert!
      // Kövesd a felhasználó témáját (történelem, biológia, matek, stb.)
      system = `Te AMISEARCH vagy. Feladatot / mintafeladatot / vizsgafeladatsort kérnek.

KÖTELEZŐ SZABÁLYOK:
1. Kövesd PONTOSAN a felhasználó kérését: témát, nehézséget, feladatszámot, feladattípusokat.
2. Ha a téma NEM matematika (pl. történelem, biológia, földrajz, irodalom), NE generálj egyenletrendszert és NE írj matekpéldát. A megadott témából készíts feladatokat.
3. Ha a téma matematika VAGY a felhasználó kifejezetten matekot kér: használj LaTeX formázást (\( ... \) vagy \[ ... \]), a törteket írd \\frac{a}{b} vagy a/b formában, lépésről lépésre oldj meg.
4. Ha VIZSGALAPOT / vizsgaszimulátort kérnek:
   - Legyen fejléc: cím (a téma neve), Név: ________, Osztály/Csoport: ________, Dátum: ________, Időtartam, Elérhető pontszám.
   - Változatos feladattípusok: rövid válasz, igaz/hamis, feleletválasztós, kifejtős.
   - Minden feladatnál tüntesd fel a pontszámot.
   - Megoldókulcsot CSAK akkor adj, ha a felhasználó kérte.
5. Formázás: ## alcímek, rendezett Markdown, üres sor a bekezdések között.
6. NE mondd, hogy "a források nem tartalmaznak" – generált feladat ez.

${isMathTopic ? "A kérés matematikai jellegű – a megoldások legyenek részletesek, LaTeX-szel." : "A kérés NEM (vagy nem feltétlenül) matematikai – a témához igazodj."}
${notesBlock}`;
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
