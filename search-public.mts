import type { Context, Config } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";

const ai = new GoogleGenAI({});

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405, "method_not_allowed");
  }

  if (!isAiConfigured()) {
    return aiUnavailableResponse();
  }

  const { query, notes, lang } = await req.json().catch(() => ({}));

  if (!query || typeof query !== "string") {
    return jsonError("Query is required", 400, "missing_query");
  }

  let prompt = query;
  if (notes) {
    prompt += "\n\nFeltöltött jegyzet kontextus:\n" + notes;
  }

  const isHungarian = lang !== 'en';

  const systemInstruction = isHungarian
    ? "Te egy tudásalapú keresőmotor vagy az AMISEARCH tanulási platformon. A weben keresel online szakkönyvekben, jegyzetekben, előadásokban és dolgozol a feltöltött jegyzetekből is. Válaszolj tömören, informatívan, MAGYARUL. Ha a felhasználó gondolattérképet kér, készíts egyet a Mermaid 'mindmap' szintaxissal. FONTOS: 1) Első sor: 'mindmap'. 2) Gyökér: ' root((Tema))' (2 szóköz behúzás). 3) Ágak: minden szint +2 szóköz. 4) Ne használj speciális karaktereket: {, }, [, ], |, <, >. 5) Max 3 szint mélység."
    : "You are a knowledge-based search engine on the AMISEARCH learning platform. Search online textbooks, notes, lectures and work with uploaded notes too. Answer concisely and informatively in ENGLISH. If the user requests a mind map, create one using Mermaid 'mindmap' syntax. IMPORTANT: 1) First line: 'mindmap'. 2) Root: ' root((Topic))' (2 spaces indent). 3) Branches: each level +2 spaces. 4) Don't use special characters: {, }, [, ], |, <, >. 5) Max 3 levels depth.";

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction,
        tools: [{ googleSearch: {} }],
      }
    });

    return streamText(stream);
  } catch (error) {
    console.error("Search AI generation failed:", error);
    return aiUnavailableResponse();
  }
};

export const config: Config = {};
