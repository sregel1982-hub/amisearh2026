import { GoogleGenAI } from "@google/genai";
import {
  getEnv,
  getSupabaseAdmin,
  json,
  readJson,
  rateLimit,
  rateLimitedResponse,
  requireUser,
  cleanString,
} from "./security-helper.mjs";

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const user = await requireUser(req);
  if (!user) return json({ error: "Bejelentkezés szükséges.", code: "unauthorized" }, 401);

  const rate = rateLimit(`query-embeddings:${user.id}`, 30, 60_000);
  if (!rate.allowed) return rateLimitedResponse(rate);

  let body;
  try {
    body = await readJson(req, 100_000);
  } catch (error) {
    if (error.message === "PAYLOAD_TOO_LARGE") return json({ error: "A kérés túl nagy." }, 413);
    return json({ error: "Érvénytelen JSON." }, 400);
  }

  const query = cleanString(body.query, 5_000);
  const requestedLimit = Number.parseInt(body.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(10, Math.max(1, requestedLimit)) : 5;
  if (!query) return json({ error: "A keresési szöveg kötelező." }, 400);

  try {
    const apiKey = getEnv("GEMINI_API_KEY") || getEnv("GOOGLE_GENAI_API_KEY");
    if (!apiKey) return json({ error: "Az embedding szolgáltatás nincs konfigurálva." }, 500);
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.embedContent({
      model: "text-embedding-004",
      contents: [{ parts: [{ text: query }] }],
    });
    const queryVector = result.embeddings?.[0]?.values;
    if (!Array.isArray(queryVector) || queryVector.length === 0) {
      return json({ error: "Nem sikerült a keresési vektor létrehozása." }, 502);
    }

    const supabase = getSupabaseAdmin();
    const { data: notes, error } = await supabase.rpc("match_uploaded_notes", {
      query_embedding: queryVector,
      match_threshold: 0.6,
      match_count: limit,
      user_id_filter: user.id,
    });
    if (error) {
      console.error("[queryEmbeddings] vector search failed:", error.message);
      return json({ error: "A vektorkeresés nem sikerült." }, 500);
    }
    return json({ success: true, notes: notes || [] });
  } catch (error) {
    console.error("[queryEmbeddings] failed:", error?.message || error);
    return json({ error: "A keresés nem sikerült." }, 500);
  }
}

export const config = {};
