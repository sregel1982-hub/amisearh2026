// netlify/functions/chat.js - AMISEARCH V4.5 FINAL
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { checkQuota, incrementUsage } from "./quota.js";
import { webSearch, imageSearch } from "./search-utils.mjs";

const getEnv = (k) => process.env[k] || (typeof Netlify!== "undefined" && Netlify.env.get?.(k));
const hasGroq =!!getEnv("GROQ_API_KEY");
const hasGemini =!!getEnv("GEMINI_API_KEY");
const geminiAi = hasGemini? new GoogleGenAI({ apiKey: getEnv("GEMINI_API_KEY") }) : null;

function jsonResponse(d, s=200){ return new Response(JSON.stringify(d),{status:s,headers:{"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}}); }
function corsOptions(){ return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, Authorization"}}); }
function textStreamResponse(gen){
  const enc=new TextEncoder();
  return new Response(new ReadableStream({
    async start(c){
      try{ for await(const chunk of gen){ if(chunk) c.enqueue(enc.encode(String(chunk).normalize('NFC'))); } c.close(); }
      catch(e){ c.error(e); }
    }
  }),{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-cache","Access-Control-Allow-Origin":"*"}});
}
function cleanText(v,m=70000){ return String(v||"").normalize('NFC').replace(/\r\n/g,"\n").replace(/\r/g,"\n").replace(/[ \t]+/g," ").replace(/\n{5,}/g,"\n\n\n\n").trim().slice(0,m); }

function getSupabaseAdmin(){
  const url=getEnv("SUPABASE_URL"), key=getEnv("SUPABASE_SERVICE_ROLE_KEY")||getEnv("SERVICE_ROLE_KEY");
  if(!url||!key) return null; return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
async function getSupabaseUser(req){
  const h=req.headers.get("authorization")||req.headers.get("Authorization"); if(!h) return null;
  const t=h.replace("Bearer ","").trim(); if(!t) return null;
  const sb=createClient(getEnv("SUPABASE_URL"),getEnv("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
  try{ const {data,error}=await sb.auth.getUser(t); if(error||!data?.user) return null; return data.user; }catch{ return null; }
}
async function loadUserNotesContext(user,inline="",noteId=null){
  const parts=[]; const inl=cleanText(inline,30000); if(inl) parts.push(`=== FELTÖLTÖTT DOKUMENTUM ===\n${inl}`);
  const sb=getSupabaseAdmin(); if(!sb||!user?.id) return parts.join("\n\n");
  try{
    const col=[]; const {data:j}=await sb.from("jegyzetek").select("id,cim,original_name,text_content,processed").eq("user_id",user.id).order("created_at",{ascending:false}).limit(5);
    if(Array.isArray(j)) col.push(...j);
    let a=0; for(const n of col){ if(a>=5) break; const ti=n.cim||n.original_name||"Jegyzet"; const tx=cleanText(n.text_content,12000); if(tx.length>80){ parts.push(`=== JEGYZET: ${ti} ===\n${tx}`); a++; } }
  }catch{}
  return parts.join("\n\n");
}

function buildSystemInstruction({hasImage=false}={}){
  const base=`You are AMISEARCH educational assistant. Always answer in same language as user. Use Hungarian accents correctly.
Use markdown: ## headings, - lists, **bold**. Each paragraph separate line, blank line between sections.
MANDATORY: Headings and bullets on new lines. End with "## Forrásjegyzék"`;
  if(hasImage) return base+"\n\nFONTOS: Kép már beillesztve a válasz elejére. SOHA ne mondd hogy nem tudsz képet mutatni.";
  return base;
}
function buildPrompt({message,notesContext,webContext,imageContext,history}){
  const hist=(Array.isArray(history)?history.slice(-8):[]).map(i=>`${i.role==="assistant"?"AI":"User"}: ${cleanText(i.content,2500)}`).join("\n");
  return [notesContext?`## NOTES\n${notesContext}\n\n`:"", imageContext?`## FOUND IMAGE\n${imageContext}\n\n`:"", webContext?`## SOURCES\n${webContext}\n\n`:"", hist?`## HISTORY\n${hist}\n\n`:"", `## QUESTION\n${message}`].filter(Boolean).join("");
}
function guessLang(t){ return /[őűáéíóúöüŐŰÁÉÍÓÚÖÜ]|\b(és|vagy|hogy|jegyzet|vizsga)\b/i.test(String(t||""))?"hu":"en"; }
function detectImageIntent(m){ const t=String(m||"").toLowerCase(); return /\b(kép|képet|fotó|mutass|ábra|illusztráció|hogy néz ki)\b/.test(t)||/\b(image|picture|photo|show me|illustration)\b/.test(t); }
function normalizeImage(r){ if(!r) return null; const u=r.url||r.imageUrl||r.link; if(!u) return null; return {url:u,title:r.title||"Kép",source:r.source||"Wikimedia Commons",sourceUrl:r.sourceUrl||r.pageUrl||""}; }
async function findImage(msg,lang){
  try{ const res=await Promise.race([imageSearch(msg.slice(0,200),lang), new Promise(r=>setTimeout(()=>r(null),6000))]); return normalizeImage(res); }catch{ return null; }
}
function buildImageMarkdown(img){ if(!img) return ""; return `![${img.title}](${img.url})\n*${img.title} – Forrás: ${img.source}*\n${img.sourceUrl?`Forrás: ${img.source}\n${img.sourceUrl}`:""}\n\n`; }

async function* geminiChunks(prompt, sys){
  const s=await geminiAi.models.generateContentStream({model:"gemini-2.5-flash",contents:[{role:"user",parts:[{text:prompt}]}],config:{systemInstruction:sys,temperature:0.4}});
  for await(const c of s){ const t=typeof c?.text==="function"?c.text():c?.text; if(t) yield t; }
}
async function* groqChunks(resp){
  const rd=resp.body.getReader(); const dec=new TextDecoder(); let buf="";
  while(true){ const {done,value}=await rd.read(); if(done) break; buf+=dec.decode(value,{stream:true}); const ls=buf.split("\n"); buf=ls.pop()||""; for(const l of ls){ const tr=l.trim(); if(!tr||!tr.startsWith("data:")) continue; const d=tr.slice(5).trim(); if(d==="[DONE]") return; try{ const j=JSON.parse(d); const delta=j?.choices?.[0]?.delta?.content; if(delta) yield delta; }catch{} } }
}
async function* prependImage(md,inner){ if(md) yield md; for await(const c of inner) yield c; }

export default async function handler(req){
  if(req.method==="OPTIONS") return corsOptions();
  if(req.method!=="POST") return jsonResponse({error:"Nem engedélyezett metódus"},405);
  let body; try{ body=await req.json(); }catch{ return jsonResponse({error:"Érvénytelen kérés"},400); }
  const message=cleanText(body?.message||body?.prompt||"",12000); if(!message) return jsonResponse({error:"Kérdés hiányzik"},400);
  const user=await getSupabaseUser(req);
  try{ const q=await checkQuota(user?.id); if(!q.allowed) return jsonResponse({error:q.message||"Limit elérve"},402); }catch{}
  const history=Array.isArray(body?.history)?body.history:[]; const inline=typeof body?.notes==="string"?body.notes:""; const noteId=body?.noteId||null;
  let notesContext=""; try{ notesContext=await loadUserNotesContext(user,inline,noteId); }catch{}
  const lang=guessLang(message);
  let webContext=""; try{ const sr=await Promise.race([webSearch(message.slice(0,200),lang), new Promise(r=>setTimeout(()=>r(null),4000))]); if(sr?.summary) webContext=`${sr.summary}\n(Forrás: ${sr.source})`; }catch{}
  let image=null, imageMD=""; if(detectImageIntent(message)){ image=await findImage(message,lang); imageMD=buildImageMarkdown(image); }
  const sys=buildSystemInstruction({hasImage:!!image});
  const prompt=buildPrompt({message,notesContext,webContext,imageContext:image?`${image.title} ${image.url} ${image.sourceUrl}`:"",history});
  incrementUsage(user?.id).catch(()=>{});
  try{ if(hasGemini) return textStreamResponse(prependImage(imageMD, geminiChunks(prompt,sys))); }catch(e){ console.error(e); }
  try{ if(hasGroq){ const k=getEnv("GROQ_API_KEY"); const r=await fetch("https://api.groq.com/openai/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${k}`},body:JSON.stringify({model:getEnv("GROQ_MODEL")||"llama3-70b-8192",stream:true,temperature:0.4,messages:[{role:"system",content:sys},{role:"user",content:prompt}]})}); if(!r.ok) throw new Error(r.status); return textStreamResponse(prependImage(imageMD, groqChunks(r))); } }catch(e){ console.error(e); }
  return jsonResponse({error:"AI szolgáltatás nem elérhető"},503);
}
