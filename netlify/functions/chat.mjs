// netlify/functions/chat.mjs - V5.6
// - nyelvérzékeny válasz (kérdés nyelve + opcionális UI lang)
// - isTask nem kényszerít matekra
// - képkérés: soha ne mondja hogy nem tud képet mutatni
// - képnél history nélkül, hogy ne ragadjanak irreleváns források
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

/** Egyszerű nyelvfelismerés a kérdésből + UI fallback */
function detectReplyLang(message, uiLang) {
  const t = String(message || "").trim();
  // Egyértelmű nem-latin / speciális minták
  if (/[\u0400-\u04FF]/.test(t)) return "ru"; // cirill
  if (/[\u4E00-\u9FFF]/.test(t)) return "zh";
  if (/[\u3040-\u30FF]/.test(t)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(t)) return "ko";
  if (/[\u0600-\u06FF]/.test(t)) return "ar";

  const lower = t.toLowerCase();

  // Magyar: ékezetek + tipikus szavak
  if (
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(t) ||
    /\b(hogy|miért|mikor|milyen|kérem|mutass|keress|feladat|vizsga|magyarázd|mi\s+az)\b/i.test(lower)
  ) {
    return "hu";
  }

  // Francia
  if (
    /[àâçéèêëîïôùûüÿœæ]/i.test(t) ||
    /\b(qu['’]est|pourquoi|comment|s'il\s+vous|montre|cherche|bonjour|merci)\b/i.test(lower)
  ) {
    return "fr";
  }

  // Olasz
  if (
    /\b(perché|cos['’]è|come|mostra|cerca|per\s+favore|grazie|ciao|vorrei)\b/i.test(lower) ||
    (/[àèéìòù]/i.test(t) && /\b(il|la|lo|gli|che|non|sono)\b/i.test(lower))
  ) {
    return "it";
  }

  // Német
  if (
    /[äöüßÄÖÜ]/.test(t) ||
    /\b(was\s+ist|warum|wie|bitte|zeig|suche|aufgabe|prüfung)\b/i.test(lower)
  ) {
    return "de";
  }

  // Spanyol
  if (
    /[ñáéíóúü¿¡]/i.test(t) ||
    /\b(qué|por\s+qué|cómo|por\s+favor|muestra|busca|hola|gracias)\b/i.test(lower)
  ) {
    return "es";
  }

  // Angol tipikus szavak
  if (
    /\b(what|why|how|when|where|please|show|find|search|explain|generate|exam|task|image|photo)\b/i.test(
      lower
    )
  ) {
    return "en";
  }

  // Ha a UI nyelv ismert (index.html currentLang), azt használjuk
  if (uiLang === "en" || uiLang === "hu") return uiLang;

  // Alap: angol, ha nincs ékezet / tipikus minta
  return "en";
}

function langInstruction(lang) {
  const map = {
    hu: "Válaszolj magyarul, helyes ékezetekkel.",
    en: "Reply in English.",
    fr: "Réponds en français.",
    it: "Rispondi in italiano.",
    de: "Antworte auf Deutsch.",
    es: "Responde en español.",
    ru: "Отвечай на русском языке.",
    zh: "请用中文回答。",
    ja: "日本語で答えてください。",
    ko: "한국어로 답변하세요.",
    ar: "أجب باللغة العربية.",
  };
  return (
    map[lang] ||
    `Reply in the same language as the user's question (detected: ${lang}).`
  );
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const message = (body.message || "").toString().slice(0, 4000);
    const notes = (body.notes || "").toString().slice(0, 12000);
    const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    // UI nyelv az oldalról (ha külditek): "hu" | "en"
    const uiLang = (body.lang || body.uiLang || "").toString().slice(0, 5).toLowerCase();

    if (!message) {
      return new Response(JSON.stringify({ error: "Empty question" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const replyLang = detectReplyLang(message, uiLang);
    const langLine = langInstruction(replyLang);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const hasImageNoun =
      /(?:k[eé]p(?:et|eket|re|en|nek)?|fot[oó](?:t|kat|k)?|illusztr[aá]ci[oó](?:t|k)?|diagram(?:ot|ok)?|[aá]bra|image|photo|picture|illustration|bild|immagine|imagen|photo|bild|이미지|画像|图片)/i.test(
        message
      );
    const hasRequestVerb =
      /(?:keress|keresd|mutass|mutasd|adj|tal[aá]lj|k[eé]rek|k[eé]rn[eé]k|szeretn[eé]k|akar(?:ok|n[aá]k)?|kell(?:ene)?|k[eé]ne|show|find|search|give|need|want|please|montre|cherche|mostra|cerca|zeig|suche|muestra|busca)/i.test(
        message
      );
    const wantsImage = hasImageNoun && hasRequestVerb;

    const web = await webSearch(message, replyLang === "hu" ? "hu" : "en").catch(() => ({
      isTask: false,
      summary: "",
      sources: [],
    }));

    let imgMd = "";
    if (wantsImage) {
      try {
        const img = await imageSearch(message);
        if (img?.url) {
          const title = (img.title || "Image").replace(/[\[\]]/g, "");
          const source = img.source || "Wikimedia Commons";
          const sourceUrl = img.sourceUrl || img.url;
          imgMd = `![\( {title}]( \){img.url})\n\n**\( {title}**  \n*Source / Forrás:* [ \){source}](${sourceUrl})\n\n---\n\n`;
        }
      } catch (e) {
        console.error("imageSearch error", e);
      }
    }

    const notesBlock = notes
      ? `\n\nUSER UPLOADED NOTES / FELHASZNÁLÓI JEGYZET:\n"""\n${notes}\n"""`
      : "";

    const isMathTopic =
      /(?:matek|matematika|math|equation|egyenlet|deriv|integr|fraction|tört|algebra|geometry|geometria)/i.test(
        message
      );

    let system = "";

    if (wantsImage) {
      system = `You are AMISEARCH, a study assistant.
${langLine}
Use ## headings, blank lines between paragraphs, - lists, **bold**.

CRITICAL RULES FOR IMAGE REQUESTS:
1. NEVER say you cannot display images, or that you are text-only and cannot show pictures.
2. ${
        imgMd
          ? "A real image was ALREADY inserted at the start of the reply (markdown). Only write a short, relevant explanation about the topic. Do NOT repeat the image. Do NOT say there is no image."
          : "No external photo was found. Give a short description of the topic and suggest better search keywords. Do NOT claim you are unable to show images as a text AI."
      }
3. Mention only sources relevant to the CURRENT question.
4. Do NOT reuse sources from earlier chat turns (e.g. unrelated DOI, random journals, mother-tongue topics).
5. If the user only asked for a picture of an animal/flower/object, do NOT list book covers or random academic papers.
6. If there is a relevant encyclopedia source, end with ## Sources / Forrásjegyzék and real URLs. Otherwise omit the sources section.

FOUND SOURCES (only if on-topic): ${
        web.summary && !/jel-kép|identitásfrász|anyanyelv/i.test(web.summary)
          ? web.summary
          : "none for this image request"
      }
${notesBlock}`;
    } else if (web.isTask) {
      system = `You are AMISEARCH. The user asks for practice tasks / an exam sheet.
${langLine}

RULES:
1. Follow the user's request exactly: topic, difficulty, number of tasks, task types.
2. If the topic is NOT math (history, biology, geography, literature, etc.), do NOT generate equation systems or math word problems — create tasks about that topic.
3. If the topic IS math: use LaTeX (\( ... \) or \[ ... \]), show steps clearly.
4. If they ask for an EXAM / vizsgalap / exam simulator sheet:
   - Header: title (topic), Name: ________, Class/Group: ________, Date: ________, Duration, Total points.
   - Mixed types: short answer, true/false, multiple choice, open-ended.
   - Points on every task.
   - Answer key ONLY if the user asked for solutions.
5. Markdown with ## headings.
6. Do not say "sources do not contain this" — these are generated tasks.

${isMathTopic ? "Mathematical request — detailed solutions with LaTeX." : "Non-math (or mixed) topic — stay on topic."}
${notesBlock}`;
    } else {
      system = `You are AMISEARCH, a study assistant.
${langLine}
Use ## headings, blank lines between paragraphs, - lists, **bold**.
Only cite sources relevant to the current question. Do not repeat irrelevant earlier sources.
FOUND SOURCES: ${web.summary || "none"}
End with ## Sources / Forrásjegyzék and real URLs when useful.${notesBlock}`;
    }

    const historyText =
      wantsImage || !history.length
        ? ""
        : history
            .map(
              (m) =>
                `${m.role === "assistant" ? "AI" : "User"}: ${m.content || ""}`
            )
            .join("\n") + "\n\n";

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: historyText + "Question: " + message }],
        },
      ],
      config: {
        systemInstruction: system,
        temperature: 0.15,
        maxOutputTokens: 4096,
      },
    });

    const enc = new TextEncoder();
    const readable = new ReadableStream({
      async start(c) {
        if (imgMd) c.enqueue(enc.encode(imgMd));
        for await (const ch of stream) {
          if (ch.text) c.enqueue(enc.encode(ch.text));
        }
        c.close();
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
};
