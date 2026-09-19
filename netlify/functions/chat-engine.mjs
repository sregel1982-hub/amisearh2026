// netlify/functions/chat.js - V4.7 - FAILED TO FETCH FIX
import { GoogleGenAI } from "@google/genai";
import { imageSearch, webSearch } from "./search-utils.mjs";

const getEnv = (k) => process.env[k];

export default async (req, context) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      }
    });
  }

  if (req.method!== "POST") {
    return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
  }

  try {
    const body = await req.json().catch(()=>({}));
    const message = (body.message || body.prompt || "").toString().slice(0,8000);
    const history = Array.isArray(body.history)? body.history.slice(-6) : [];
    if(!message) return new Response(JSON.stringify({error:"Üres kérdés"}),{status:400,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});

    if(!getEnv("GEMINI_API_KEY")){
      return new Response(JSON.stringify({error:"GEMINI_API_KEY hiányzik a Netlify env-ben"}),{status:500,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}});
    }

    const ai = new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") });
    const isImage = /kép|fotó|mutass|ford t|modell|hogy néz ki|image|photo|model t/i.test(message);

    let imgMd = "";
    if(isImage){
      try{
        const q = message.toLowerCase().includes("ford")? "Ford Model T car" : message.slice(0,120);
        const img = await imageSearch(q, "en") || await imageSearch(q, "hu");
        if(img?.url){
          imgMd = `![${(img.title||"Kép").replace(/\]/g,"")}](${img.url})\n*Forrás: ${img.source||"Wikimedia"}*\n${img.sourceUrl||""}\n\n`;
        }
      }catch(e){ console.error("imageSearch error", e); }
    }

    const system = `Te AMISEARCH vagy. Magyarul válaszolj, ékezetekkel.
Formázás: ## alcím minden új sorban, üres sor a bekezdések közt, - lista, **félkövér**.
${imgMd? "A válasz elején már van kép markdownban. SOHA ne mondd hogy nem tudsz képet mutatni!" : "Ha képet kérnek, a rendszer beilleszti."}
Végén: ## Forrásjegyzék`;

    const promptText = `${history.map(m=> (m.role||"user")+": "+(m.content||"")).join("\n")}\n\nKérdés: ${message}`;

    const stream = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents: [{ role:"user", parts:[{text: promptText}] }],
      config: { systemInstruction: system }
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller){
        try{
          if(imgMd) controller.enqueue(encoder.encode(imgMd));
          for await(const chunk of stream){
            const t = chunk?.text;
            if(t) controller.enqueue(encoder.encode(t));
          }
          controller.close();
        }catch(err){
          console.error(err);
          controller.enqueue(encoder.encode("\n\n[Hiba a stream közben: "+err.message+"]"));
          controller.close();
        }
      }
    });

    return new Response(readable, {
      headers:{
        "Content-Type":"text/plain; charset=utf-8",
        "Access-Control-Allow-Origin":"*",
        "Cache-Control":"no-cache"
      }
    });

  } catch (e) {
    console.error("FATAL chat error", e);
    return new Response(JSON.stringify({error: "Chat engine hiba: "+e.message, stack: e.stack?.slice(0,1000)}),{
      status:500,
      headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}
    });
  }
};
