export async function handler(event) {
  const { prompt, type } = JSON.parse(event.body);
  const apiKey = process.env.GEMINI_API_KEY; // Netlify env var

  let systemPrompt = "";
  if (type === 'mermaid') {
    systemPrompt = "Te egy Mermaid.js szakértő vagy. Csak Mermaid kódot adj vissza, graph TD-vel kezdődjön. Semmi más szöveg.";
  } else if (type === 'quiz') {
    systemPrompt = "Te egy kvízkészítő vagy. JSON-t adj vissza: {questions:[{question,answers[],correctIndex,explanation}]}";
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    })
  });
  const data = await res.json();
  return { statusCode: 200, body: JSON.stringify({ text: data.candidates[0].content.parts[0].text }) };
}
