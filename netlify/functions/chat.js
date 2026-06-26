import { checkQuota, incrementUsage } from "./quota.js";
import {
  getSupabaseUser,
  jsonResponse,
  corsOptionsResponse,
  cleanText
} from "./utils.js";
import {
  answerText,
  answerImage
} from "./chat-engine.mjs";

export default async (req) => {
  try {
    if (req.method === "OPTIONS") return corsOptionsResponse();
    if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

    let body = {};
    try {
      const raw = await req.text();
      if (raw) body = JSON.parse(raw);
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400);
    }

    const user = await getSupabaseUser(req);
    if (!user) return jsonResponse({ error: "Unauthorized" }, 401);

    const quota = await checkQuota(user.id, "ai_questions");
    if (!quota.allowed) {
      return jsonResponse({
        error: quota.message || "AI quota exceeded",
        code: "quota_exceeded",
        field: "ai_questions"
      }, 402);
    }

    const message = cleanText(body.message || body.query || "", 12000);
    if (!message) return jsonResponse({ error: "Missing message" }, 400);

    const type = String(body.type || "").toLowerCase();

    await incrementUsage(user.id, "ai_questions");

    if (type === "image") {
      return await answerImage(message);
    }

    return await answerText({
      message,
      history: body.history || [],
      notes: body.notes || ""
    });
  } catch (err) {
    console.error("Fatal error:", err);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
};
