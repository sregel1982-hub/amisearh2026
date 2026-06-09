import { getSupabaseUser } from "./auth-helper.mjs";
import { GoogleGenAI } from "@google/genai";
import { aiUnavailableResponse, isAiConfigured, jsonError, streamText } from "./ai-response.js";
import { createClient } from "@supabase/supabase-js";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")),
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY
);

function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\\quad_?/g, " ")
    .replace(/\\_/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMindmapRequest(message) {
  const lower = message.toLowerCase();
  const keywords = ["gondolattérkép", "gondolat térkép", "gondolatterkep", "mindmap", "mind map", "térkép", "terkep"];
  return keywords.some(kw => lower.includes(kw));
}

export default async function handler(req) {
  try {
    if (req.method !== "POST") return jsonError("Method not allowed", 405);

    const user = await getSupabaseUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    if (!isAiConfigured()) return aiUnavailableResponse();

    const body = await req.json();
    const { message, history = [], notes, noteId } = body;

    if (!message) return jsonError("Message required", 400);

    // === Gondolattérkép kérés kezelése ===
    if (isMindmapRequest(message)) {
      const siteUrl = (typeof Netlify !== "undefined" && Netlify.env.get("URL")) || "https://amisearch.org";
      let topic = message.replace(/gondolattérkép|gondolat térkép|gondolatterkep|mindmap|mind map|térkép|terkep/gi, "").trim() || "Tananyag";
      const mindmapUrl = `${siteUrl}/mindmap.html?topic=${encodeURIComponent(topic)}`;
      
      return new Response(
        `✅ Itt a gondolattér
