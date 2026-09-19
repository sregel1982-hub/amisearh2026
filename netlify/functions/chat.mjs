// V4.6 - KÉP KÉNYSZERÍTÉS + PDF STRUKTÚRA MEGTARTÁS
import { GoogleGenAI } from "@google/genai";
import { imageSearch, webSearch } from "./search-utils.mjs";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function buildSystem(hasImage){
  return `Te AMISEARCH vagy. Magyarul válaszolj, ékezetekkel helyesen.
HASZNÁLD: ## alcímek, - vagy • lista, **félkövér**. Minden bekezdés külön sor, üres sor a szakaszok közt.
${hasImage? "A válasz elején már van egy![kép](url) markdown kép. SOHA ne mondd hogy nem tudsz képet mutatni. A képet már beillesztettük." : "Ha a felhasználó képet kér, ne mondd hogy nem tudsz, hanem a rendszer majd beilleszti."}
A végén mindig: ## Forrásjegyzék`;
}
function detectImage(q){ return /kép|fotó|mutass|ford t|illusztráció|hogy néz ki|image|photo/i.test(q); }

export default async function handler(req){
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  const {message, history} = await req.json();
  const lang = /[őűáéíóúöü]/.test(message)? "hu" : "en";
  let imgMd = "";
  let hasImage = false;

  if(detectImage(message)){
    // Ford T-re külön próbálkozunk angolul is
    const q = message.includes("Ford")? "Ford Model T" : message.slice(0,120);
    const img = await imageSearch(q, lang) || await imageSearch(q, "en");
    if(img?.url){
      imgMd = `![${img.title||"Kép"}](${img.url})\n*Forrás: ${img.source}*\n${img.sourceUrl||""}\n\n`;
      hasImage = true;
    }
  }

  const prompt = `${history?.slice(-4).map(m=>m.role+": "+m.content).join("\n")}\n\nKérdés: ${message}`;
  const stream = await ai.models.generateContentStream({
    model:"gemini-2.5-flash",
    contents:[{role:"user", parts:[{text:prompt}]}],
    config:{systemInstruction: buildSystem(hasImage)}
  });

  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    async start(c){
      if(imgMd) c.enqueue(enc.encode(imgMd));
      for await(const chunk of stream){ if(chunk.text) c.enqueue(enc.encode(chunk.text)); }
      c.close();
    }
  }),{headers:{"Content-Type":"text/plain; charset=utf-8"}});
}
