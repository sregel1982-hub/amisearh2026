// netlify/functions/chat.mjs - V5.8
// Kép: CSAK string + összefűzés (ne template literal — elromlik deploy közben)
// isTask nem kényszerít matekra · nyelvérzékeny · soha ne mondja hogy nem tud képet
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

function detectReplyLang(message, uiLang) {
  var t = String(message || "").trim();
  if (/[\u0400-\u04FF]/.test(t)) return "ru";
  if (/[\u4E00-\u9FFF]/.test(t)) return "zh";
  if (/[\u3040-\u30FF]/.test(t)) return "ja";
  if (/[\uAC00-\uD7AF]/.test(t)) return "ko";
  if (/[\u0600-\u06FF]/.test(t)) return "ar";
  var lower = t.toLowerCase();
  if (
    /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(t) ||
    /\b(hogy|miért|mikor|milyen|kérem|mutass|keress|feladat|vizsga|kellene|rózsáról|képet)\b/i.test(lower)
  )
    return "hu";
  if (/\b(what|why|how|please|show|find|search|image|photo|generate)\b/i.test(lower))
    return "en";
  if (/\b(pourquoi|comment|montre|cherche)\b/i.test(lower)) return "fr";
  if (/\b(perché|mostra|cerca|grazie)\b/i.test(lower)) return "it";
  if (/\b(warum|bitte|zeig|suche)\b/i.test(lower) || /[äöüß]/i.test(t)) return "de";
  if (/\b(qué|cómo|muestra|busca)\b/i.test(lower)) return "es";
  if (uiLang === "en" || uiLang === "hu") return uiLang;
  return "en";
}

function langLine(lang) {
  if (lang === "hu") return "Válaszolj magyarul, helyes ékezetekkel.";
  if (lang === "en") return "Reply in English.";
  if (lang === "fr") return "Réponds en français.";
  if (lang === "it") return "Rispondi in italiano.";
  if (lang === "de") return "Antworte auf Deutsch.";
  if (lang === "es") return "Responde en español.";
  return "Reply in the same language as the user.";
}

export default async function handler(req) {
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
    var body = await req.json().catch(function () {
      return {};
    });
    var message = String(body.message || "").slice(0, 4000);
    var notes = String(body.notes || "").slice(0, 12000);
    var history = Array.isArray(body.history) ? body.history.slice(-8) : [];
    var uiLang = String(body.lang || body.uiLang || "")
      .slice(0, 5)
      .toLowerCase();

    if (!message) {
      return new Response(JSON.stringify({ error: "Empty question" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    var replyLang = detectReplyLang(message, uiLang);
    var ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    var hasImageNoun =
      /(?:kép|képet|képek|fotó|fotót|illusztr|ábra|image|photo|picture|illustration)/i.test(
        message
      );
    var hasRequestVerb =
      /(?:keress|keresd|mutass|mutasd|adj|találj|kérek|kérnék|szeretnék|akarok|kellene|kéne|show|find|search|give|need|want|please)/i.test(
        message
      );
    // „egy kép kellene egy rózsáról” is képkérés
    var wantsImage =
      hasImageNoun &&
      (hasRequestVerb || /kellene|kéne|kérek|mutass|keress/i.test(message));

    var web = await webSearch(message, replyLang === "hu" ? "hu" : "en").catch(
      function () {
        return { isTask: false, summary: "", sources: [] };
      }
    );

    // ===== KÉP — csak + összefűzés =====
    var imgMd = "";
    if (wantsImage) {
      try {
        var img = await imageSearch(message);
        if (img && img.url) {
          var title = String(img.title || "Kép").replace(/[\[\]]/g, "");
          var source = String(img.source || "Wikimedia Commons");
          var sourceUrl = String(img.sourceUrl || img.url);
          var url = String(img.url);
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

    var notesBlock = notes
      ? "\n\nUSER NOTES:\n\"\"\"\n" + notes + "\n\"\"\""
      : "";

    var isMathTopic =
      /(?:matek|matematika|math|egyenlet|equation|deriv|integr|tört|algebra)/i.test(
        message
      );

    var system = "";

    if (wantsImage) {
      system =
        "You are AMISEARCH.\n" +
        langLine(replyLang) +
        "\n\n" +
        "TILTOTT MONDATOK (soha ne írd le):\n" +
        "- „szöveges alapú mesterséges intelligenciaként nem tudok képeket megjeleníteni”\n" +
        "- „I cannot display images”\n" +
        "- „as a text-based AI I cannot show images”\n" +
        "- bármilyen „nem tudok képet mutatni” változat\n\n" +
        (imgMd
          ? "A rendszer MÁR beillesztett egy valós képet a válasz elejére. Te csak rövid, releváns magyarázatot írj. NE ismételd a képet."
          : "Most nem találtunk külső fotót. Írj rövid leírást a témáról, és javasolj keresőszavakat. NE mondd hogy nem tudsz képet megjeleníteni.") +
        "\nCsak a jelenlegi témához illő források. NE említs korábbi irreleváns DOI-t.\n" +
        "FOUND: " +
        (web.summary && !/jel-kép|identitásfrász|anyanyelv/i.test(web.summary)
          ? web.summary
          : "nincs") +
        notesBlock;
    } else if (web.isTask) {
      system =
        "You are AMISEARCH. Practice tasks or exam sheet requested.\n" +
        langLine(replyLang) +
        "\nFollow the user's topic exactly. If NOT math, do not generate equations. If math, use LaTeX. Exam sheet: Name, Class, Date, points, mixed question types.\n" +
        (isMathTopic ? "Math request." : "Non-math topic.") +
        notesBlock;
    } else {
      system =
        "You are AMISEARCH.\n" +
        langLine(replyLang) +
        "\nUse ## headings, lists, **bold**. Relevant sources only.\nFOUND: " +
        (web.summary || "none") +
        notesBlock;
    }

    var historyText = "";
    if (!wantsImage && history.length) {
      historyText =
        history
          .map(function (m) {
            return (m.role === "assistant" ? "AI" : "User") + ": " + (m.content || "");
          })
          .join("\n") + "\n\n";
    }

    var stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: historyText + "Question: " + message }],
        },
      ],
      config: {
        systemInstruction: system,
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    var enc = new TextEncoder();
    var readable = new ReadableStream({
      start: async function (c) {
        if (imgMd) c.enqueue(enc.encode(imgMd));
        for await (var ch of stream) {
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
}
