const getEnv = (key) => (typeof Netlify !== "undefined" && Netlify.env.get(key)) || process.env[key];

export function isAiConfigured() {
  const apiKey = getEnv("GEMINI_API_KEY");
  if (!apiKey) {
    console.error("isAiConfigured: GEMINI_API_KEY hiányzik.");
    return false;
  }
  return true;
}

export function aiUnavailableResponse() {
  return new Response(JSON.stringify({ error: "AI szolgáltatás jelenleg nincs beállítva vagy nem elérhető." }), {
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
        if (done) {
          break;
        }
        controller.enqueue(new TextDecoder().decode(value));
      }
      controller.close();
    },
  });

  return new Response(customStream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
