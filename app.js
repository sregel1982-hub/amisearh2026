// ===== AMISEARCH APP.JS - FINAL V6 - teljes javított =====
const themes = {
    purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', name: '🟣 Purple' },
    blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE', name: '🔵 Blue' },
    emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5', name: '🟢 Green' },
    orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7', name: '🟠 Orange' },
    pink: { primary: '#EC4899', hover: '#DB2777', light: '#FCE7F3', name: '🔴 Pink' },
};
function initThemePicker() {
    if(document.getElementById('theme-picker')) return;
    const picker = document.createElement('div');
    picker.id = 'theme-picker';
    picker.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; background:white; padding:15px; border-radius:50px; display:flex; gap:8px; box-shadow:0 8px 25px rgba(0,0,0,0.15); border:2px solid #eee;';
    Object.entries(themes).forEach(([key, theme]) => {
        const circle = document.createElement('button');
        circle.title = theme.name;
        circle.style.cssText = `width:35px; height:35px; border-radius:50%; background:${theme.primary}; cursor:pointer; border:3px solid white;`;
        circle.textContent = theme.name.charAt(0);
        circle.onclick = () => applyTheme(key);
        picker.appendChild(circle);
    });
    document.body.appendChild(picker);
    applyTheme(localStorage.getItem('amisearch-theme') || 'purple');
}
function applyTheme(name){
    const t=themes[name]; if(!t) return;
    let st=document.getElementById('dynamic-theme-style')||document.createElement('style');
    st.id='dynamic-theme-style';
    st.innerHTML=`:root{--primary:${t.primary}!important}.btn-primary,button[type="submit"]{background:${t.primary}!important}a{color:${t.primary}!important}`;
    if(!st.parentElement) document.head.appendChild(st);
    localStorage.setItem('amisearch-theme',name);
}

// SZÉLES KÉP + FORRÁS GUARD
function isImageRequest(txt){
    const q=String(txt).toLowerCase();
    return q.includes('kép')||q.includes('rajz')||q.includes('fotó')||q.includes('illusztr');
}
function guardImagePrompt(q){
    let subject=String(q).replace(/kép kellene egy|képet kérek|rajzolj egy|mutass egy/gi,'').trim();
    const lower=q.toLowerCase();
    const wantsHuman=lower.includes('ember')||lower.includes('portré');
    if(!wantsHuman){
        return `${subject}, photorealistic, no human, no person, animal or object only, high detail, 4k`;
    }
    return `${subject}, photorealistic, high detail`;
}
function validateSources(sources, query){
    if(!sources) return [];
    const kw=String(query).toLowerCase().split(/\s+/).filter(w=>w.length>3);
    return sources.filter(s=>{
        const txt=String(s.text||s.title||'').toLowerCase();
        if(txt.includes('eurózóna') && !query.toLowerCase().includes('euró')) return false;
        if(txt.includes('anyanyelv') && !query.toLowerCase().includes('anyanyelv')) return false;
        return kw.some(k=>txt.includes(k));
    });
}
async function searchOnlineFallback(query){
    try{
        const r=await fetch(`https://hu.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
        const d=await r.json();
        return d.query.search.slice(0,3).map(x=>({title:x.title,text:x.snippet.replace(/<[^>]*>/g,''),url:`https://hu.wikipedia.org/wiki/${encodeURIComponent(x.title)}`,source:'Wikipedia'}));
    }catch(e){return [];}
}

// FELADAT GENERÁTOR
window.generatePracticeWithPDF = async function() {
    const topic=document.getElementById('practiceTopicInput')?.value||'Feladatok';
    const difficulty=document.getElementById('practiceDifficulty')?.value||'közepes';
    const count=document.getElementById('practiceCountInput')?.value||1;
    const out=document.getElementById('practiceOutput');
    out.innerHTML=`<div class="text-center py-8">Generálás...</div>`;
    setTimeout(()=>{
        const content=`<h2>${topic} - ${difficulty}</h2>${Array.from({length:count},(_,i)=>`<div style="margin:20px 0;padding:15px;border-left:4px solid #6C5CE7;"><strong>Feladat ${i+1}:</strong> Magyarázd a ${topic} alapelveit!</div>`).join('')}`;
        out.innerHTML=`<div class="prose-like" style="font-family:Poppins,Arial;line-height:1.8;">${content}</div><div style="margin-top:20px;"><button onclick="downloadPracticeAsPDF()" class="btn-primary text-white px-4 py-2 rounded">PDF letöltés (szép)</button> <button onclick="downloadPracticeAsWord()" class="bg-blue-600 text-white px-4 py-2 rounded">Word letöltés</button></div>`;
    },600);
};

// SZÉP PDF - html2pdf-et magától tölti, nem kell index.html
window.downloadPracticeAsPDF = async function() {
    if(!window.html2pdf){
        await new Promise((res)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';s.onload=res;document.head.appendChild(s);});
    }
    const el=document.getElementById('practiceOutput');
    const clone=el.cloneNode(true);
    clone.style.padding='20px'; clone.style.background='white';
    const header=document.createElement('div');
    header.innerHTML=`<div style="text-align:center;color:#6C5CE7;font-weight:700;font-size:20px;border-bottom:2px solid #6C5CE7;padding-bottom:8px;margin-bottom:15px;">AMISEARCH • amisearch.org</div>`;
    clone.prepend(header);
    const opt={margin:[15,12,15,12],filename:`AMISEARCH-${Date.now()}.pdf`,image:{type:'jpeg',quality:0.98},html2canvas:{scale:2,useCORS:true,backgroundColor:'#fff'},jsPDF:{unit:'mm',format:'a4'}};
    html2pdf().set(opt).from(clone).save();
};
window.downloadPracticeAsWord = async function() {
    const topic=document.getElementById('practiceTopicInput')?.value||'Feladatok';
    const content=document.getElementById('practiceOutput')?.innerText||'Feladatok';
    const html=`<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h1>${topic}</h1><div>${content.replace(/\n/g,'<br>')}</div></body></html>`;
    const blob=new Blob([html],{type:'application/msword'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${topic}.doc`;a.click();
};

// AI TUTOR FETCH OVERRIDE - kép + forrás széles
(function(){
    const orig=window.fetch.bind(window);
    window.fetch=async function(input,init){
        const url=typeof input==='string'?input:input.url;
        if(url&&url.includes('/.netlify/functions/')&&init&&init.body){
            try{
                const body=JSON.parse(init.body);
                const q=body.query||body.prompt||body.content||'';
                if(isImageRequest(q)){
                    body.safePrompt=guardImagePrompt(q);
                    body.isImageRequest=true;
                    init.body=JSON.stringify(body);
                }
            }catch(e){}
        }
        return orig(input,init);
    };
})();

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ()=>{initThemePicker(); window.generatePractice=window.generatePracticeWithPDF;}); } else { initThemePicker(); window.generatePractice=window.generatePracticeWithPDF; }
console.log('✅ AMISEARCH FINAL V6 aktív - szép PDF + széles kép/forrás');
