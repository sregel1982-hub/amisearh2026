// js/fix-ai-stream.js - AMISEARCH V4.5 - nem kell index.html-t szerkeszteni, csak ezt a fájlt feltölteni
// Ez javítja a "AI válasz nem érhető el." hibát
const API="/.netlify/functions/chat";
function renderMD(t){ return (window.marked? marked.parse(t): t); }
async function streamAI(prompt, onChunk){
  const token=localStorage.getItem('sb_token')||'';
  const res=await fetch(API,{
    method:"POST",
    headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},
    body: JSON.stringify({message:prompt, history:[]})
  });
  if(!res.ok) throw new Error(await res.text());
  const rd=res.body.getReader(); const dec=new TextDecoder(); let full="";
  while(true){ const {done,value}=await rd.read(); if(done) break; full+=dec.decode(value,{stream:true}); onChunk(full); }
  return full;
}
window.addEventListener('DOMContentLoaded', ()=>{
  const taskBtn=document.querySelector('[data-action="generate-tasks"]')||document.getElementById('generateTaskBtn')||document.querySelector('button:has(+ input[value="Gének"])')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Feladat'));
  const examBtn=document.getElementById('generateExamBtn')||Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Feladatsor'));
  
  const taskBox=document.getElementById('taskResult')||document.querySelector('.task-result');
  const examBox=document.getElementById('examResult')||document.querySelector('.exam-result');

  if(taskBtn){ taskBtn.addEventListener('click', async ()=>{
    const topic=document.querySelector('input[placeholder="Gének"]')?.value||"Gének";
    const level=document.querySelector('select')?.value||"Közepes";
    if(taskBox) taskBox.innerHTML='<p>Generálás...</p>';
    try{ await streamAI(`Készíts ${level} szintű feladatokat: ${topic}. Markdown, Forrásjegyzék.`, f=>{ if(taskBox) taskBox.innerHTML=renderMD(f); }); }
    catch(e){ if(taskBox) taskBox.innerHTML=`<p style="color:red">Hiba: ${e.message}. Nézd meg a Netlify logot.</p>`; }
  }); }
});
