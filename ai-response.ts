export function jsonError(
  message: string,
  status: number,
  code = "request_failed",
): Response {
  return Response.json({ error: message, code }, { status });
}

export function aiUnavailableResponse(): Response {
  return jsonError("AI service is not configured or unavailable.", 503, "ai_unavailable");
}

export function isAiConfigured(): boolean {
  return Boolean(
    Netlify.env.get("GEMINI_API_KEY") ||
      process.env.GEMINI_API_KEY ||
      Netlify.env.get("NETLIFY_AI_GATEWAY_KEY") ||
      process.env.NETLIFY_AI_GATEWAY_KEY,
  );
}

export async function streamText(
  chunks: AsyncIterable<{ text?: string }>,
): Promise<Response> {
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
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
