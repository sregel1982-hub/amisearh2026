// ⚠️ IDEIGLENES DIAGNOSZTIKAI FÜGGVÉNY — törölhető a hibakeresés után

function envGet(name) {
  if (typeof Netlify !== "undefined" && Netlify.env && Netlify.env.get) {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function maskValue(value) {
  if (!value) return null;
  if (value.length <= 12) return value.substring(0, 4) + "***";
  return value.substring(0, 8) + "..." + value.substring(value.length - 4);
}

export default async function handler(req) {
  const apiKey = envGet("GROQ_API_KEY");

  const result = {
    envCheck: {
      GROQ_API_KEY: !!apiKey,
      GROQ_API_KEY_PREFIX: maskValue(apiKey),
      NODE_VERSION: process.version
    }
  };

  if (!apiKey) {
    result.error = "GROQ_API_KEY nincs beállítva";
    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  // 1. Elérhető modellek lekérése a Groq fiókból
  try {
    const modelsResp = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { "Authorization": `Bearer ${apiKey}` }
    });
    const modelsText = await modelsResp.text();
    result.modelsListStatus = modelsResp.status;
    try {
      const parsed = JSON.parse(modelsText);
      result.availableModels = Array.isArray(parsed?.data)
        ? parsed.data.map(m => m.id)
        : parsed;
    } catch {
      result.availableModelsRaw = modelsText.slice(0, 1000);
    }
  } catch (e) {
    result.modelsListError = e.message;
  }

  // 2. Egyszerű, NEM streamelt teszthívás pár jelölt modellel
  const candidateModels = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "gemma2-9b-it"
  ];

  result.completionTests = {};

  for (const model of candidateModels) {
    try {
      const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 30,
          messages: [{ role: "user", content: "Mondj egy szót magyarul." }]
        })
      });
      const text = await resp.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* marad text */ }
      result.completionTests[model] = {
        ok: resp.ok,
        status: resp.status,
        content: parsed?.choices?.[0]?.message?.content || null,
        raw: parsed ? undefined : text.slice(0, 500),
        error: parsed?.error || null
      };
    } catch (e) {
      result.completionTests[model] = { ok: false, exception: e.message };
    }
  }

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

export const config = {};
