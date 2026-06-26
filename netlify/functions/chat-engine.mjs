import { GoogleGenAI } from "@google/genai";
import {
  detectLanguage,
  webSearch,
  imageSearch
} from "./search-utils.mjs";
import { cleanText } from "./utils.js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

function textStreamResponse(generator) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          if (chunk) controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        console.error("Stream error:", err);
        controller.error(err);
      }
    }
  }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*"
    }
  });
}

function singleChunkStream(text) {
  async function* gen() { yield text; }
  return textStreamResponse(gen());
}

function buildSystemInstructionText() {
  return `You are the AMISEARCH educational assistant.\nAnswer in the same language as the user.\nUse reliable sources when available.\nAlways end with "## Forrásjegyzék".`;
}

function buildPrompt({ message, webContext, history, notes }) {
  const historyArray = Array.isArray(history) ? history.slice(-8) : [];

  const historyText = historyArray
    .map(item => `${item.role === "assistant" ? "AI" : "User"}: ${cleanText(item.content, 2500)}`)
    .join("\n");

  return [
    notes ? `## NOTES\n${cleanText(notes, 12000)}\n\n` : "",
    webContext ? `## EXTERNAL SOURCES\n${webContext}\n\n` : "",
    historyText ? `## HISTORY\n${historyText}\n\n` : "",
    `## QUESTION\n${message}`
  ].filter(Boolean).join("");
}

export async function answerText({ message, history = [], notes = "" }) {
  const lang = await detectLanguage(message);
  const web = await webSearch(message, lang);

  const webContext = web
    ? `=== SOURCE: ${web.source} ===\n${web.summary}\nURL: ${web.url}`
    : "";

  const promptText = buildPrompt({
    message,
    webContext,
    history,
    notes
  });

  const stream = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    systemInstruction: buildSystemInstructionText(),
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
  });

  async function* generator() {
    for await (const chunk of stream) {
      const text = chunk?.text || "";
      if (text) yield text;
    }
  }

  return textStreamResponse(generator());
}

export async function answerImage(message) {
  const img = await imageSearch(message);

  if (!img) {
    return singleChunkStream("Sajnálom, nem találtam szabadon felhasználható képet.\n\n## Forrásjegyzék");
  }

  const md = `

![${img.title}](${img.url})

\n\n**${img.title}**  \nForrás: ${img.source}  \n${img.sourceUrl}\n\n## Forrásjegyzék\n- ${img.source}`;

  return singleChunkStream(md);
}  
