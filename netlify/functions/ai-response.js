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
        try {
          for await (const chunk of chunks) {
            if (chunk.text) {
              controller.enqueue(encoder.encode(chunk.text));
            }
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

