 // --- Amisearch AI Kapcsolat Javító ---
const getEnv = (key) => process.env[key] || (typeof Netlify !== "undefined" && Netlify.env.get(key));

export function isAiConfigured() {
  const apiKey = getEnv("GEMINI_API_KEY");
  return !!apiKey;
}

export function aiUnavailableResponse() {
  return new Response(JSON.stringify({ 
    error: "Az AI szolgáltatás pillanatnyilag nem elérhető. Kérjük, ellenőrizze a Netlify beállításokat és végezzen egy 'Clear cache and deploy' műveletet." 
  }), {
    status: 500,
    headers: { "Content-Type": "application/json" }
  });
}

export function jsonError(message, status = 400, code = "error") {
  return new Response(JSON.stringify({ error: message, code }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function streamText(stream) {
  const reader = stream.stream.getReader();
  const customStream = new ReadableStream({
    async start(controller) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(value);
      }
      controller.close();
    },
  });
  return new Response(customStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
