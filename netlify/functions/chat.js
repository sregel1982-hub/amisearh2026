import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseUser } from "./auth-helper.mjs";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const getEnv = (key) =>
  (typeof Netlify!== "undefined" && Netlify.env.get(key)) || process.env[key];

const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });

function getSupabaseAdmin() {
  const url = getEnv("SUPABASE_URL");
  const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key);
}

//... cleanText, detectLanguage, simpleScore, loadUserNotesContext marad mint nálad...

// EZ AZ ÚJ RÉSZ: diagram + doksi felismerés egyben
async function handleChartRequest(user, question, notesContext) {
  const prompt = `
Felhasználói kérés: ${question}

Elérhető jegyzet tartalom:
${notesContext || "Nincs feltöltött jegyzet."}

Döntsd el:
1. Kell-e diagramot rajzolni? Ha a user kéri: "rajzold fel", "ábrázold", "grafikon", "diagram", "sin(x)", "függvény", "oszlopdiagram", "kördiagram"
2. Ha kell diagram ÉS van jegyzet, akkor a jegyzet adatait használd fel a diagramhoz.

Ha KELL diagram, válaszolj CSAK JSON-nal:
{
  "needsChart": true,
  "chartConfig": {
    "type": "line",
    "data": { 
      "labels": ["x1", "x2"], 
      "datasets": [{ "label": "Adatsor neve", "data": [1, 2] }] 
    },
    "options": { 
      "plugins": { "title": { "display": true, "text": "Diagram címe" } },
      "scales": { "x": { "title": { "display": true, "text": "X tengely" } }, "y": { "title": { "display": true, "text": "Y tengely" } } }
    }
  },
  "explanation": "Rövid magyarázat 1-2 mondatban hogy mit ábrázol a diagram. Ha jegyzetből vetted az adatot, írd bele: 'A feltöltött jegyzeted alapján...'"
}

Ha NEM kell diagram, válaszolj:
{ "needsChart": false }

FONTOS: Ha a jegyzetben van táblázat, számsor, mérési eredmény, abból csinálj grafikont.
`;

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: { temperature: 0.2 }
  });

  const text = result.candidates[0].content.parts[0].text.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(text);

  if (parsed.needsChart) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
   .from("charts")
   .insert({
        user_id: user.id,
        question: question,
        config: parsed.chartConfig,
        explanation: parsed.explanation
      })
   .select()
   .single();

    if (error) throw error;

    return {
      type: "chart_link",
      answer: `Elkészítettem a diagramot a ${notesContext? 'feltöltött jegyzeted' : 'kérésed'} alapján. [Megnyitás külön oldalon](/chart.html?id=${data.id})`,
      url: `/chart.html?id=${data.id}`
    };
  }
  return null;
}

export default async function handler(req) {
  try {
    if (req.method!== "POST") return jsonError("Method not allowed", 405);
    if (!isAiConfigured()) return aiUnavailableResponse();

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("Jelentkezz be újra.", 401);

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim();
    if (!message) return jsonError("Hiányzó üzenet.", 400);

    // 1. Töltsük be a jegyzetet ELŐSZÖR
    const notesContext = await loadUserNotesContext(user, message, body.notes || "");
    
    // 2. Nézzük meg kell-e diagram, és adjuk át neki a jegyzetet is
    const chartResult = await handleChartRequest(user, message, notesContext);
    if (chartResult) {
      return new Response(JSON.stringify(chartResult), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. Ha nem kellett diagram, normál chat a jegyzet kontextussal
    const prompt = buildPrompt({ message, notesContext, history: body.history || [] });

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: buildSystemInstruction("hu"),
        temperature: 0.35,
      },
    });

    return streamText(stream);
  } catch (error) {
    console.error("Chat AI error:", error);
    return aiUnavailableResponse();
  }
}
