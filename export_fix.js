// --- Amisearch ULTIMATE FIX (Név, Jobb oldali Színválasztó, Valódi PDF/Word) ---

(function() {
    // 1. SZÍNEK ÉS STÍLUSOK
    const themes = {
        blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE' },
        purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF' },
        emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5' },
        orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7' }
    };

    window.changeSiteTheme = function(themeName) {
        const theme = themes[themeName];
        if (!theme) return;
        let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
        styleTag.id = 'dynamic-theme-style';
        styleTag.innerHTML = `
            :root { --primary-color: ${theme.primary} !important; }
            .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, button[type="submit"], header { background-color: ${theme.primary} !important; }
            .text-indigo-600, .text-\\[\\#6C5CE7\\] { color: ${theme.primary} !important; }
            .bg-indigo-50 { background-color: ${theme.light} !important; }
            .border-indigo-600 { border-color: ${theme.primary} !important; }
        `;
        document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    // 2. SZÖVEG TISZTÍTÁSA
    function cleanAiText(text) {
        if (!text) return "";
        return text
            .replace(/^(Rendben|Íme|Tessék|Oké|Szia|Értem|Szia|Helló).+?(\!|\.|\:)\n?/i, "") 
            .replace(/\\frac\{(.+?)\}\{(.+?)\}/g, "$1/$2") 
            .replace(/[\{\}\$]/g, "") 
            .replace(/Amisearh|Amisrarh/g, "Amisearch") 
            .trim();
    }

    // 3. EXPORT FUNKCIÓK
    window.downloadAiAnswerPdf = function(btn) {
        const bubble = btn.closest('.ai-bubble, .bg-white, .message');
        if (!bubble) return;
        const content = cleanAiText(bubble.innerText || bubble.textContent);
        
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Amisearch PDF</title>
            <style>
                body { font-family: 'Arial', sans-serif; padding: 50px; line-height: 1.6; color: #333; }
                .header { background: #6C5CE7; color: white; padding: 25px; text-align: center; margin: -50px -50px 40px -50px; }
                h1 { color: #6C5CE7; border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; }
                .text { white-space: pre-wrap; font-size: 16px; }
            </style></head><body>
            <div class="header"><h1 style="color:white; border:none; margin:0;">Amisearch</h1></div>
            <h1>Amisearch Feladatsor</h1>
            <div class="text">${content}</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
            </body></html>
        `);
        win.document.close();
    };

    window.downloadAiAnswerWord = function(btn) {
        const bubble = btn.closest('.ai-bubble, .bg-white, .message');
        if (!bubble) return;
        const content = cleanAiText(bubble.innerText || bubble.textContent);
        const html = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'></head><body>
            <div style="background:#6C5CE7; color:white; padding:20px; text-align:center;"><h1>Amisearch</h1></div>
            <h2>Amisearch Feladatsor</h2>
            <p style="white-space:pre-wrap;">${content.replace(/\n/g, '<br>')}</p>
            </body></html>
        `;
        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'amisearch-export.doc';
        a.click();
    };

    // 4. AUTOMATIKUS INDÍTÁS ÉS POZÍCIONÁLÁS
    function runFix() {
        document.body.innerHTML = document.body.innerHTML.replace(/Amisearh|Amisrarh/g, 'Amisearch');
        
        if (!document.getElementById('amisearch-picker')) {
            const picker = document.createElement('div');
            picker.id = 'amisearch-picker';
            // Áthelyezve a jobb oldalra (right: 20px)
            picker.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:99999; background:white; padding:12px; border-radius:40px; display:flex; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.3); border:3px solid #6C5CE7;';
            Object.keys(themes).forEach(name => {
                const c = document.createElement('div');
                c.style.cssText = `width:30px; height:30px; border-radius:50%; background:${themes[name].primary}; cursor:pointer; border:3px solid white; transition:0.2s;`;
                c.onclick = () => window.changeSiteTheme(name);
                picker.appendChild(c);
            });
            document.body.appendChild(picker);
        }
        
        const saved = localStorage.getItem('amisearch-theme');
        if (saved) window.changeSiteTheme(saved);
    }

    setTimeout(runFix, 1000);
    setTimeout(runFix, 3000);
})();
