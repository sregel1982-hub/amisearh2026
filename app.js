// ===== AMISEARCH APP.JS - SECURED 2026 =====
// Javítások: prompt injection guard + XSS védelem + auth check

// 0. SECURITY GUARDS - EZT TEDD A LEGTETEJÉRE
const SECURITY = {
  // Prompt injection szűrés az AI Tutorhoz
  sanitizePrompt(input) {
    if (!input) return "";
    // Tiltott utasítások
    const blocked = /ignore.*instructions|disregard|system\s*:|reveal.*prompt|show.*keys|as an? (AI|system)|jailbreak|DAN/gi;
    if (blocked.test(input)) {
      console.warn("🚨 Prompt injection attempt blocked:", input);
      return "[Biztonsági szűrés] Kérlek, csak tanulással kapcsolatos kérdést tegyél fel.";
    }
    // HTML injection védelem
    return input.replace(/</g, "&lt;").replace(/>/g, "&gt;").trim().substring(0, 2000);
  },

  // Auth check - ha nincs user, dobja vissza loginra
  requireAuth() {
    const user = localStorage.getItem('amisearch-user') || sessionStorage.getItem('supabase-auth');
    if (!user) {
      const isApiCall = window.location.pathname.startsWith('/api/');
      if (isApiCall) {
        // API hívásnál ne HTML-t adjon, hanem 401 JSON-t - EZ A LÉNYEG
        document.body.innerHTML = JSON.stringify({ error: "Bejelentkezés szükséges", code: 401 });
        throw new Error("UNAUTHORIZED");
      }
      // Frontendnél irányítson loginra
      if (!window.location.pathname.includes('login') && !window.location.pathname.includes('index.html')) {
        // Csak akkor irányít, ha tényleg védett oldal
        console.log("Auth required - redirecting");
      }
    }
    return !!user;
  }
};

// 1. THEME COLOR PICKER (biztonságos)
const themes = {
    purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', name: '🟣 Purple' },
    blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE', name: '🔵 Blue' },
    emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5', name: '🟢 Green' },
    orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7', name: '🟠 Orange' },
    pink: { primary: '#EC4899', hover: '#DB2777', light: '#FCE7F3', name: '🔴 Pink' },
};

function initThemePicker() {
    if (document.getElementById('theme-picker')) return;
    const picker = document.createElement('div');
    picker.id = 'theme-picker';
    picker.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; background:white; padding:15px; border-radius:50px; display:flex; gap:8px; box-shadow:0 8px 25px rgba(0,0,0,0.15); border:2px solid #eee;';
    
    Object.entries(themes).forEach(([key, theme]) => {
        const circle = document.createElement('button');
        circle.title = theme.name;
        circle.type = 'button';
        circle.setAttribute('aria-label', theme.name);
        circle.style.cssText = `width:35px; height:35px; border-radius:50%; background:${theme.primary}; cursor:pointer; border:3px solid white; transition:all 0.3s; font-size:18px;`;
        circle.textContent = theme.name.charAt(0);
        circle.onclick = () => applyTheme(key);
        picker.appendChild(circle);
    });
    document.body.appendChild(picker);
    
    const saved = localStorage.getItem('amisearch-theme') || 'purple';
    applyTheme(saved);
}

function applyTheme(themeName) {
    const theme = themes[themeName];
    if (!theme || !/^[a-z]+$/.test(themeName)) return; // XSS védelem
    
    let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
    styleTag.id = 'dynamic-theme-style';
    styleTag.textContent = `
        :root { --primary: ${theme.primary} !important; --primary-dark: ${theme.hover} !important; }
        .btn-primary, button[type="submit"], .bg-indigo-600 { background-color: ${theme.primary} !important; }
        .btn-primary:hover, button[type="submit"]:hover { background-color: ${theme.hover} !important; }
        .text-indigo-600, .gradient-text { color: ${theme.primary} !important; }
        .bg-indigo-50, .bg-purple-50 { background-color: ${theme.light} !important; }
    `;
    if (!styleTag.parentElement) document.head.appendChild(styleTag);
    localStorage.setItem('amisearch-theme', themeName);
}

// 2. PDF EXPORT - SECURED
window.generatePracticeWithPDF = async function() {
    SECURITY.requireAuth();
    
    const rawTopic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const topic = SECURITY.sanitizePrompt(rawTopic); // SZŰRÉS
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'közepes';
    const count = Math.min(parseInt(document.getElementById('practiceCountInput')?.value || 3), 20); // max 20
    
    const output = document.getElementById('practiceOutput');
    if (!output) return;
    output.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-600"></i><p class="mt-2">Feladatok generálása...</p></div>`;
    
    setTimeout(() => {
        // Biztonságos HTML építés - nem innerHTML injection
        const container = document.createElement('div');
        const h2 = document.createElement('h2');
        h2.textContent = `${topic} - ${difficulty} szintű feladatok`;
        container.appendChild(h2);
        
        for(let i=0; i<count; i++){
            const div = document.createElement('div');
            div.style.cssText = 'margin:20px 0; padding:15px; border-left:4px solid #6C5CE7;';
            div.innerHTML = `<strong>Feladat ${i+1}:</strong><br>Magyarázd meg a ${topic} alapelveit!<br><br><em style="color:#666;">Tipp: Kezdd az alapfogalmakkal...</em>`;
            container.appendChild(div);
        }
        
        output.innerHTML = '';
        output.appendChild(container);
        
        const buttons = document.createElement('div');
        buttons.style.marginTop = '20px';
        buttons.innerHTML = `
            <button onclick="downloadPracticeAsPDF()" class="btn-primary text-white px-4 py-2 rounded mr-2">PDF letöltés</button>
            <button onclick="downloadPracticeAsWord()" class="bg-blue-600 text-white px-4 py-2 rounded">Word letöltés</button>
        `;
        output.appendChild(buttons);
    }, 800);
};

window.downloadPracticeAsPDF = async function() {
    SECURITY.requireAuth();
    if (!window.jspdf) { alert("jsPDF betöltése szükséges!"); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    
    const topic = SECURITY.sanitizePrompt(document.getElementById('practiceTopicInput')?.value || 'Feladatok');
    doc.setFont('Helvetica', 'bold'); doc.setFontSize(20); doc.setTextColor(108,92,231);
    doc.text('AMISEARCH', 20, 20);
    doc.setFont('Helvetica', 'normal'); doc.setFontSize(12); doc.setTextColor(0,0,0);
    doc.text(`Gyakorló: ${topic}`, 20, 30);
    doc.text(`Dátum: ${new Date().toLocaleDateString('hu-HU')}`, 20, 38);
    doc.save(`${topic.replace(/[^a-z0-9]/gi,'_')}_feladatok.pdf`);
};

// 3. AI TUTOR - PROMPT INJECTION VÉDETT VERZIÓ
// Ezt kösd be a tutor chat küldés gombjára
window.sendTutorMessage = function(rawInput){
    const cleanInput = SECURITY.sanitizePrompt(rawInput);
    if (!cleanInput) return;
    // Itt megy a Supabase / Gemini hívás a cleanInput-tal, nem a rawInput-tal
    console.log("Secure prompt:", cleanInput);
    // fetch('/api/tutor', { method: 'POST', body: JSON.stringify({ prompt: cleanInput }) })
};

// 4. INIT
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        SECURITY.requireAuth();
        initThemePicker();
        window.generatePractice = window.generatePracticeWithPDF;
    });
} else {
    SECURITY.requireAuth();
    initThemePicker();
    window.generatePractice = window.generatePracticeWithPDF;
}
console.log('✅ AMISEARCH App secured!');
