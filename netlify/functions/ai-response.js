// --- AMISEARCH AI response helpers ---
const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get(key));

export function isAiConfigured() {
  return !!getEnv("GEMINI_API_KEY");
}

export function aiUnavailableResponse() {
  return new Response(JSON.stringify({
    error: "Az AI szolgáltatás pillanatnyilag nem elérhető. Kérjük, ellenőrizd a Netlify környezeti változókat, különösen a GEMINI_API_KEY értékét.",
    code: "ai_unavailable"
  }), {
    status: 503,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export function jsonError(message, status = 400, code = "error") {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export function extractText(result) {
  if (!result) return "";
  if (typeof result.text === "function") return result.text() || "";
  if (typeof result.text === "string") return result.text;
  if (typeof result.candidates?.[0]?.content?.parts?.[0]?.text === "string") {
    return result.candidates[0].content.parts[0].text;
  }
  return "";
}

function chunkToText(chunk) {
  if (!chunk) return "";
  if (typeof chunk === "string") return chunk;
  if (typeof chunk.text === "function") return chunk.text() || "";
  if (typeof chunk.text === "string") return chunk.text;
  if (typeof chunk.candidates?.[0]?.content?.parts?.[0]?.text === "string") {
    return chunk.candidates[0].content.parts[0].text;
  }
  return "";
}

export async function streamText(streamResult) {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      try {
        if (streamResult && typeof streamResult[Symbol.asyncIterator] === "function") {
          for await (const chunk of streamResult) {
            const text = chunkToText(chunk);
            if (text) controller.enqueue(encoder.encode(text));
          }
        } else if (streamResult?.stream && typeof streamResult.stream[Symbol.asyncIterator] === "function") {
          for await (const chunk of streamResult.stream) {
            const text = chunkToText(chunk);
            if (text) controller.enqueue(encoder.encode(text));
          }
        } else if (streamResult?.stream?.getReader) {
          const reader = streamResult.stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value instanceof Uint8Array) controller.enqueue(value);
            else {
              const text = chunkToText(value);
              if (text) controller.enqueue(encoder.encode(text));
            }
          }
        } else {
          const text = chunkToText(streamResult);
          if (text) controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        console.error("AI stream error:", error?.message || error);
        controller.enqueue(encoder.encode("\n\nAz AI válasz streamelése közben hiba történt."));
      } finally {
        controller.close();
      }
    }
  });

  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
