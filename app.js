// ===== AMISEARCH APP.JS - FINAL V6 - teljes javított =====

// 1. THEME COLOR PICKER
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
        circle.style.cssText = `width:35px; height:35px; border-radius:50%; background:${theme.primary}; cursor:pointer; border:3px solid white; transition:all 0.3s;`;
        circle.textContent = theme.name.charAt(0);
        circle.onclick = () => applyTheme(key);
        picker.appendChild(circle);
    });
    document.body.appendChild(picker);
    const saved = localStorage.getItem('amisearch-theme') || 'purple';
    applyTheme(saved);
}

function applyTheme(themeName) {
    const theme = themes[themeName]; if (!theme) return;
    let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
    styleTag.id = 'dynamic-theme-style';
    styleTag.innerHTML = `:root { --primary: ${theme.primary}!important; --primary-dark: ${theme.hover}!important; }.btn-primary, button[type="submit"],.bg-indigo-600,.bg-\\[\\#6C5CE7\\] { background-color: ${theme.primary}!important; }.text-indigo-600,.text-\\[\\#6C5CE7\\] { color: ${theme.primary}!important; }.bg-indigo-50,.bg-purple-50 { background-color: ${theme.light}!important; } a { color: ${theme.primary}!important; }`;
    if (!styleTag.parentElement) document.head.appendChild(styleTag);
    localStorage.setItem('amisearch-theme', themeName);
}

// 2. KÉP ÉS FORRÁS GUARD - SZÉLES KÖRŰ
function isImageRequest(text){
    const q = String(text).toLowerCase();
    return q.includes('kép') || q.includes('rajz') || q.includes('illusztr') || q.includes('fotó') || q.includes('foto') || q.includes('image') || q.includes('picture');
}

function guardImagePrompt(userQuery){
    let subject = String(userQuery).replace(/kép kellene egy|képet kérek egy|rajzolj egy|mutass egy|kép egy/gi,'').trim();
    const lower = userQuery.toLowerCase();
    const wantsHuman = lower.includes('ember') || lower.includes('nő') || lower.includes('férfi') || lower.includes('portré');

    if(!wantsHuman){
        return `${subject}, photorealistic, no human, no person, no people, animal or object only, high detail, sharp focus, 4k, natural lighting`;
    }
    return `${subject}, photorealistic, high detail, 4k`;
}

function validateSources(sources, query){
    if(!sources ||!sources.length) return [];
    const keywords = String(query).toLowerCase().split(/\s+/).filter(w=>w.length>3);
    return sources.filter(s=>{
        const txt = String(s.text||s.title||'').toLowerCase();
        // dobd ha eurozóna, anyanyelv, irreleváns és nincs benne kulcsszó
        if(txt.includes('eurózóna') &&!query.toLowerCase().includes('euró')) return false;
        if(txt.includes('anyanyelv') &&!query.toLowerCase().includes('anyanyelv')) return false;
        const score = keywords.filter(k=>txt.includes(k)).length;
        return score>0;
    });
}

// Online széles forrás keresés - Wikipedia fallback
async function searchOnlineFallback(query){
    try{
        const res = await fetch(`https://hu.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`);
        const data = await res.json();
        return data.query.search.slice(0,3).map(r=>({
            title: r.title,
            text: r.snippet.replace(/<[^>]*>/g,''),
            url: `https://hu.wikipedia.org/wiki/${encodeURIComponent(r.title)}`,
            source: 'Wikipedia'
        }));
    }catch(e){ return []; }
}

// 3. FELADAT GENERÁTOR - JAVÍTOTT FORMÁZÁS
window.generatePracticeWithPDF = async function() {
    const topic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'közepes';
    const count = document.getElementById('practiceCountInput')?.value || 3;
    const output = document.getElementById('practiceOutput');
    output.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-600"></i> <p class="mt-2">Feladatok generálása...</p></div>`;

    setTimeout(() => {
        const content = `
<h2>${topic} - ${difficulty} szintű feladatok</h2>
<p>Ezek a feladatok a tanulásod támogatásához lettek generálva.</p>
${Array.from({length: parseInt(count)}, (_, i) => `
<div style="margin: 20px 0; padding: 15px; border-left: 4px solid #6C5CE7;">
    <strong>Feladat ${i+1}:</strong><br>
    Magyarázd meg a ${topic} alapelveit és adj 3 gyakorlati példát!
    <br><br>
    <em style="color: #666;">Megoldás: ${difficulty} szintű tudás...</em>
</div>`).join('')}`;
        output.innerHTML = `<div class="prose-like" style="font-family:Poppins,Arial,sans-serif; line-height:1.8;">${content}</div>`;
        const buttons = document.createElement('div');
        buttons.style.marginTop = '20px';
        buttons.innerHTML = `
            <button onclick="downloadPracticeAsPDF()" class="btn-primary text-white px-4 py-2 rounded mr-2"><i class="fa-solid fa-file-pdf"></i> PDF letöltés (szép)</button>
            <button onclick="downloadPracticeAsWord()" class="bg-blue-600 text-white px-4 py-2 rounded"><i class="fa-solid fa-file-word"></i> Word letöltés</button>`;
        output.appendChild(buttons);
    }, 800);
};

// 4. PDF LETÖLTÉS - SZÉP, INDEX.HTML ÉRINTÉSE NÉLKÜL
window.downloadPracticeAsPDF = async function() {
    if(!window.html2pdf){
        await new Promise((res, rej)=>{
            const s=document.createElement('script');
            s.src='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            s.onload=res; s.onerror=rej;
            document.head.appendChild(s);
        });
    }
    const element = document.getElementById('practiceOutput');
    const clone = element.cloneNode(true);
    clone.style.padding='20px';
    clone.style.background='white';

    const header = document.createElement('div');
    header.innerHTML = `<div style="text-align:center; color:#6C5CE7; font-weight:700; font-size:20px; border-bottom:2px solid #6C5CE7; padding-bottom:8px; margin-bottom:15px;">AMISEARCH • amisearch.org</div>`;
    clone.prepend(header);

    const opt = {
        margin: [15, 12, 15, 12],
        filename: `AMISEARCH-${Date.now()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css','legacy'] }
    };
    html2pdf().set(opt).from(clone).save();
};

window.downloadPracticeAsWord = async function() {
    const topic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const content = document.getElementById('practiceOutput')?.innerText || 'Feladatok';
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${topic}</title><style>body{font-family:Arial,sans-serif;margin:40px;}h1{color:#6C5CE7;}</style></head><body><h1>AMISEARCH - ${topic}</h1><div>${content.replace(/\n/g,'<br>')}</div></body></html>`;
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`${topic}.doc`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// 5. AI TUTOR FELÜLÍRÁS - széles kép + forrás
(function(){
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
        const url = typeof input === 'string'? input : input.url;
        if(url && url.includes('/.netlify/functions/') && init && init.body){
            try{
                const body = JSON.parse(init.body);
                const q = body.query || body.prompt || body.content || '';
                if(isImageRequest(q)){
                    body.safePrompt = guardImagePrompt(q);
                    body.isImageRequest = true;
                    init.body = JSON.stringify(body);
                    console.log('🐴 Kép guard:', body.safePrompt);
                }
            }catch(e){}
        }
        return originalFetch(input, init);
    };
    window.validateAndSearch = async function(sources, query){
        let valid = validateSources(sources, query);
        if(valid.length===0){
            // ha nincs jó találat, keress online
            const online = await searchOnlineFallback(query);
            return online;
        }
        return valid;
    };
})();

// 6. INIT
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { initThemePicker(); window.generatePractice = window.generatePracticeWithPDF; });
} else { initThemePicker(); window.generatePractice = window.generatePracticeWithPDF; }

console.log('✅ AMISEARCH FINAL V6 - szép PDF + széles kép/forrás keresés aktív');
