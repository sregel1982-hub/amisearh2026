export function jsonError(message, status, code = "request_failed") {
  return new Response(
    JSON.stringify({ error: message, code }),
    {
      status,
      headers: { "Content-Type": "application/json" }
    }
  );
}

export function aiUnavailableResponse() {
  return jsonError(
    "AI service is not configured or unavailable.",
    503,
    "ai_unavailable"
  );
}

export function isAiConfigured() {
  return Boolean(
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
    process.env.GEMINI_API_KEY ||
    (typeof Netlify !== "undefined" && Netlify.env.get("NETLIFY_AI_GATEWAY_KEY")) ||
    process.env.NETLIFY_AI_GATEWAY_KEY
  );
}

export async function streamText(chunks) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        // Forrásokat gyűjtjük a stream közben (duplikátum nélkül)
        const sources = new Map();

        const collectSources = (chunk) => {
          const meta = chunk?.candidates?.[0]?.groundingMetadata;
          const grounding = meta?.groundingChunks;
          if (!Array.isArray(grounding)) return;
          for (const g of grounding) {
            const uri = g?.web?.uri;
            const title = g?.web?.title || uri;
            if (!uri) continue;
            // Wikipédia kiszűrése
            if (/wikipedia\.org/i.test(uri) || /wikipedia\.org/i.test(title)) continue;
            if (!sources.has(uri)) sources.set(uri, title);
          }
        };

        try {
          for await (const chunk of chunks) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
            collectSources(chunk);
          }

          // A válasz végén kattintható forrásjegyzék
          if (sources.size > 0) {
            let footer = "\n\n---\n**Források:**\n";
            let i = 1;
            for (const [uri, title] of sources) {
              footer += `${i}. [${title}](${uri})\n`;
              i++;
            }
            controller.enqueue(encoder.encode(footer));
          }

          controller.close();
        } catch (error) {
          controller.error(error);
        }
      }
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }
  );
}
