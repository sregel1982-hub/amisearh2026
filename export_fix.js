// --- Amisearch ULTIMATE FIX (Név, Eltolt Színválasztó, Szép PDF) ---

(function() {
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
        `;
        document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    function cleanAiTextForExport(text) {
        if (!text) return "";
        return text
            .replace(/^(Rendben|Íme|Tessék|Oké|Szia|Értem|Szia|Helló).+?(\!|\.|\:)\n?/i, "") 
            .split(/=== FORRÁSOK ===|=== SOURCES ===|Források:|Sources:/i)[0] // Források levágása
            .replace(/\\frac\{(.+?)\}\{(.+?)\}/g, "$1/$2") 
            .replace(/[\{\}\$]/g, "") 
            .replace(/Amisearh|Amisrarh/g, "Amisearch") 
            .trim();
    }

    window.downloadAiAnswerPdf = function(btn) {
        const bubble = btn.closest('.ai-bubble, .bg-white, .message');
        if (!bubble) return;
        const content = cleanAiTextForExport(bubble.innerText || bubble.textContent);
        
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Amisearch Dokumentum</title>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap');
                body { font-family: 'Inter', Arial, sans-serif; padding: 60px; line-height: 1.8; color: #2D3436; background: #fff; }
                .header { border-bottom: 3px solid #6C5CE7; padding-bottom: 20px; margin-bottom: 40px; display: flex; justify-content: space-between; align-items: center; }
                .logo { color: #6C5CE7; font-size: 28px; font-weight: bold; }
                .date { color: #636E72; font-size: 14px; }
                h1 { color: #2D3436; font-size: 24px; margin-bottom: 25px; }
                .content { white-space: pre-wrap; font-size: 16px; text-align: justify; }
                @media print { .no-print { display: none; } }
            </style></head><body>
            <div class="header">
                <div class="logo">Amisearch</div>
                <div class="date">${new Date().toLocaleDateString('hu-HU')}</div>
            </div>
            <h1>Tanulási Segédlet</h1>
            <div class="content">${content}</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
            </body></html>
        `);
        win.document.close();
    };

    function runFix() {
        // Név javítása az egész oldalon (beleértve az email címet is)
        document.body.innerHTML = document.body.innerHTML.replace(/Amisearh|Amisrarh/g, 'Amisearch');
        
        if (!document.getElementById('amisearch-picker')) {
            const picker = document.createElement('div');
            picker.id = 'amisearch-picker';
            // FELJEBB TOLVA: bottom: 100px
            picker.style.cssText = 'position:fixed; bottom:100px; right:20px; z-index:99999; background:white; padding:12px; border-radius:40px; display:flex; gap:12px; box-shadow:0 10px 30px rgba(0,0,0,0.3); border:3px solid #6C5CE7;';
            Object.keys(themes).forEach(name => {
                const c = document.createElement('div');
                c.style.cssText = `width:30px; height:30px; border-radius:50%; background:${themes[name].primary}; cursor:pointer; border:3px solid white;`;
                c.onclick = () => window.changeSiteTheme(name);
                picker.appendChild(c);
            });
            document.body.appendChild(picker);
        }
        const saved = localStorage.getItem('amisearch-theme');
        if (saved) window.changeSiteTheme(saved);
    }
    setTimeout(runFix, 1000);
})();
