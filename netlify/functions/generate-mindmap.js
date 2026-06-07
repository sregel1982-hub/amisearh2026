import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { topic } = await req.json();
  if (!topic) {
    return new Response("Missing topic", { status: 400 });
  }

  const genAI = new GoogleGenerativeAI(
    (typeof Netlify !== "undefined" && Netlify.env.get("GEMINI_API_KEY")) ||
      process.env.GEMINI_API_KEY
  );

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-image"
  });

  const prompt = `
Készíts egy letisztult, modern, oktatási célú gondolattérképet képként.
Téma: ${topic}

Stílus:
- fehér háttér
- színes, vékony vonalak
- jól olvasható csomópontok
- vizuálisan rendezett
- ne legyen rajta hosszú szöveg, csak kulcsszavak
`;

  const result = await model.generateImage({
    prompt,
    size: "1024x1024"
  });

  const imageBytes = result.image;

  return new Response(imageBytes, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": "attachment; filename=mindmap.png"
    }
  });
}
