// chat.js V4.9 - FORRÁSOK MINDENHONNAN
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

export default async (req) => {
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*","Access-Control-Allow-Methods":"POST,OPTIONS"}});
  try{
    const {message} = await req.json();
    const ai = new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
    const needImg = /kép|fotó|templom|ford|korona|felvilágosodás|image|photo/i.test(message);

    let imgMd="", webCtx="", sources=[];
    if(needImg){
      const img = await imageSearch(message, "hu");
      if(img?.url) imgMd = `![${img.title}](${img.url})\n*${img.title} – Forrás: ${img.source}*\n${img.sourceUrl}\n\n`;
    }
    const web = await webSearch(message, "hu");
    if(web?.sources){
      sources=web.sources;
      webCtx = web.summary + "\n\nForrások URL-lel:\n" + sources.map(s=>`- ${s.source}: ${s.title} – ${s.url}`).join("\n");
    }

    const system = `AMISEARCH vagy. Magyarul, tagoltan válaszolj.
Szabály: ## alcímek külön sorban, üres sor a szakaszok közt, - lista, **félkövér**.
${imgMd? "Kép már beillesztve a válasz elejére, ne mondd hogy nem tudsz képet mutatni." : ""}
A végén KÖTELEZŐ Forrásjegyzék valódi URL-ekkel a megadott forrásokból. Soha ne írd hogy "belső adatbázis", mindig a valódi URL-t add meg.
${webCtx? "## TALÁLT FORRÁSOK\n"+webCtx : ""}`;

    const stream = await ai.models.generateContentStream({model:"gemini-2.5-flash",contents:[{role:"user",parts:[{text:message}]}],config:{systemInstruction:system}});
    const enc=new TextEncoder();
    return new Response(new ReadableStream({
      async start(c){ if(imgMd) c.enqueue(enc.encode(imgMd)); for await(const ch of stream){ if(ch.text) c.enqueue(enc.encode(ch.text)); } c.close(); }
    }),{headers:{"Content-Type":"text/plain; charset=utf-8","Access-Control-Allow-Origin":"*"}});
  }catch(e){ return new Response(JSON.stringify({error:e.message}),{status:500,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"}}); }
};
import { imageSearch, webSearch } from "./search-utils.mjs";
import { GoogleGenAI } from "@google/genai";

export default async (req)=>{
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"*"}});
  const {message} = await req.json();
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});

  const web=await webSearch(message, "hu");
  let imgMd="";
  if(/kép|templom|korona|pécs|ford|felvilágosodás/i.test(message)){
    const img=await imageSearch(message); if(img?.url) imgMd=`![${img.title}](${img.url})\n\n`;
  }

  let system="";
  if(web.isTask){
    system=`Te AMISEARCH matektanár vagy. A felhasználó FELADATOT kér. GENERÁLJ egy kétismeretlenes egyenletrendszer feladatot, oldd meg lépésről lépésre.
Formázás: ## Feladat, ## Megoldás, ## Ellenőrzés. Használj szép matek formázást. NE hivatkozz külső forrásokra, mert ez saját generált feladat.`;
  } else {
    system=`Te AMISEARCH vagy. Magyarul, tagoltan válaszolj. ## alcímek, - lista.
${imgMd?"Kép már beillesztve.":""}
Források:\n${web.summary}\nA végén: ## Forrásjegyzék valódi URL-ekkel. Soha ne írd hogy "nem tartalmaznak" ha feladat.`;
  }

  const stream=await ai.models.generateContentStream({model:"gemini-2.5-flash",contents:[{role:"user",parts:[{text:message}]}],config:{systemInstruction:system}});
  const enc=new TextEncoder();
  return new Response(new ReadableStream({
    async start(c){ if(imgMd) c.enqueue(enc.encode(imgMd)); for await(const ch of stream){ if(ch.text) c.enqueue(enc.encode(ch.text)); } c.close(); }
  }),{headers:{"Content-Type":"text/plain; charset=utf-8","Access-Control-Allow-Origin":"*"}});
};
