// netlify/functions/chat.mjs - V5.7
// nyelvérzékeny · kép string-összefűzéssel · isTask nem kényszerít matekra · képnél nincs rossz history
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

function detectReplyLang(message, uiLang) {
  const t = String(message || "").trim();
  if (/[\u0400-\u04FF]/.test(t)) return "ru";
  if (/[\u4E00-\u9FFF]/.test(t)) return "zh";
  if (/[\u3040-\u30FF]/.test(t)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(t)) return "ko";
  if (/[\u0600-\u06FF]/.test(t)) return "ar";

  const lower = t.toLowerCase();

  if (
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(t) ||
    /\b(hogy|miért|mikor|milyen|kérem|mutass|keress|feladat|vizsga|magyarázd|mi\s+az|kellene)\b/i.test(lower)
  ) {
    return "hu";
  }
  if (
    /[àâçéèêëîïôùûüÿœæ]/i.test(t) ||
    /\b(qu['’]est|pourquoi|comment|montre|cherche|bonjour|merci)\b/i.test(lower)
  ) {
    return "fr";
  }
  if (
    /\b(perché|cos['’]è|come|mostra|cerca|grazie|ciao|vorrei)\b/i.test(lower) ||
    (/[àèéìòù]/i.test(t) && /\b(il|la|lo|gli|che|non|sono)\b/i.test(lower))
  ) {
    return "it";
  }
  if (
    /[äöüßÄÖÜ]/.test(t) ||
    /\b(was\s+ist|warum|wie|bitte|zeig|suche|aufgabe)\b/i.test(lower)
  ) {
    return "de";
  }
  if (
    /[ñáéíóúü¿¡]/i.test(t) ||
    /\b(qué|por\s+qué|cómo|muestra|busca|hola|gracias)\b/i.test(lower)
  ) {
    return "es";
  }
  if (
    /\b(what|why|how|when|where|please|show|find|search|explain|generate|exam|task|image|photo)\b/i.test(
      lower
    )
  ) {
    return "en";
  }
  if (uiLang === "en" || uiLang === "hu") return uiLang;
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
  return map[lang] || `Reply in the same language as the user's question (${lang}).`;
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
      /(?:k[eé]p(?:et|eket|re|en|nek)?|fot[oó](?:t|kat|k)?|illusztr[aá]ci[oó](?:t|k)?|diagram(?:ot|ok)?|[aá]bra|image|photo|picture|illustration|bild|immagine|imagen)/i.test(
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

    // --- Kép: string összefűzés, NINCS ${} / {{}} sablon ---
    let imgMd = "";
    if (wantsImage) {
      try {
        const img = await imageSearch(message);
        if (img && img.url) {
          const title = String(img.title || "Kép").replace(/[\[\]]/g, "");
          const source = String(img.source || "Wikimedia Commons");
          const sourceUrl = String(img.sourceUrl || img.url);
          const url = String(img.url);
          imgMd =
            "![" +
            title +
            "](" +
            url +
            ")\n\n**" +
            title +
            "**  \n*Forrás:* [" +
            source +
            "](" +
            sourceUrl +
            ")\n\n---\n\n";
        }
      } catch (e) {
        console.error("imageSearch error", e);
      }
    }

    const notesBlock = notes
      ? "\n\nUSER NOTES / FELHASZNÁLÓI JEGYZET:\n\"\"\"\n" + notes + "\n\"\"\""
      : "";

    const isMathTopic =
      /(?:matek|matematika|math|equation|egyenlet|deriv|integr|fraction|tört|algebra|geometry|geometria)/i.test(
        message
      );

    let system = "";

    if (wantsImage) {
      system =
        "You are AMISEARCH, a study assistant.\n" +
        langLine +
        "\nUse ## headings, blank lines between paragraphs, - lists, **bold**.\n\n" +
        "CRITICAL RULES FOR IMAGE REQUESTS:\n" +
        "1. NEVER say you cannot display images or that you are text-only.\n" +
        "2. " +
        (imgMd
          ? "A real image was ALREADY inserted at the start of the reply (markdown). Only write a short relevant explanation. Do NOT repeat the image. Do NOT say there is no image."
          : "No external photo was found. Describe the topic briefly and suggest search keywords. Do NOT claim you cannot show images.") +
        "\n" +
        "3. Only sources relevant to the CURRENT question.\n" +
        "4. Do NOT reuse earlier chat sources (random DOI, unrelated journals).\n" +
        "5. If the user only asked for a picture, do not list book covers or random papers.\n" +
        "6. If useful, end with ## Forrásjegyzék / Sources and real URLs; otherwise omit.\n\n" +
        "FOUND SOURCES: " +
        (web.summary && !/jel-kép|identitásfrász|anyanyelv/i.test(web.summary)
          ? web.summary
          : "none for this image request") +
        notesBlock;
    } else if (web.isTask) {
      system =
        "You are AMISEARCH. The user asks for practice tasks or an exam sheet.\n" +
        langLine +
        "\n\nRULES:\n" +
        "1. Follow topic, difficulty, number of tasks, task types exactly.\n" +
        "2. If topic is NOT math, do NOT generate equation systems — tasks about that topic only.\n" +
        "3. If topic IS math: use LaTeX (\( ... \) or \[ ... \]), clear steps.\n" +
        "4. Exam sheet: header with title, Name, Class/Group, Date, Duration, Total points; mixed task types; points per task; answer key only if asked.\n" +
        "5. Markdown with ## headings.\n" +
        "6. Do not say sources do not contain this — tasks are generated.\n\n" +
        (isMathTopic
          ? "Mathematical request — detailed solutions with LaTeX."
          : "Non-math topic — stay on topic.") +
        notesBlock;
    } else {
      system =
        "You are AMISEARCH, a study assistant.\n" +
        langLine +
        "\nUse ## headings, blank lines, - lists, **bold**.\n" +
        "Only cite sources relevant to the current question.\n" +
        "FOUND SOURCES: " +
        (web.summary || "none") +
        "\nEnd with ## Forrásjegyzék / Sources and real URLs when useful." +
        notesBlock;
    }

    const historyText =
      wantsImage || !history.length
        ? ""
        : history
            .map(function (m) {
              return (m.role === "assistant" ? "AI" : "User") + ": " + (m.content || "");
            })
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
