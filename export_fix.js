// --- AMISEARCH VÉGLEGES JAVÍTÓ FÁJL ---
(function() {
    console.log("Amisearch Fix Aktiválva");

    // 1. SZÍNVÁLASZTÓ (A gyerek ötlete alapján)
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
            .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, header { background-color: ${theme.primary} !important; }
            .text-indigo-600 { color: ${theme.primary} !important; }
        `;
        document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    // 2. PDF ÉS WORD GENERÁLÁS (Tiszta szöveg, nem kép)
    window.downloadAiAnswerPdf = function(btn) {
        const bubble = btn.closest('.ai-bubble, .message, .bg-white');
        const rawText = bubble ? (bubble.innerText || bubble.textContent) : "";
        // Tisztítás: levágjuk a sallangot és a forrásokat a fájlból
        const cleanText = rawText.replace(/^(Rendben|Íme|Szia|Értem).+?\n/i, "").split(/=== FORRÁSOK ===/i)[0].trim();

        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Amisearch PDF</title><style>
                body { font-family: sans-serif; padding: 50px; line-height: 1.6; }
                .h { border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; margin-bottom: 30px; color: #6C5CE7; font-weight: bold; font-size: 24px; }
            </style></head><body>
            <div class="h">Amisearch - Tanulási Segédlet</div>
            <div style="white-space: pre-wrap;">${cleanText}</div>
            <script>window.onload = function() { window.print(); window.close(); }</script>
            </body></html>
        `);
        win.document.close();
    };

    // 3. NÉVJAVÍTÁS ÉS SZÍNPALETTA ELHELYEZÉSE
    function applyFixes() {
        // Név javítása
        document.body.innerHTML = document.body.innerHTML.replace(/Amisearh|Amisrarh/g, 'Amisearch');

        // Színválasztó gombok létrehozása a jobb oldalon, az email felett
        if (!document.getElementById('amisearch-picker')) {
            const picker = document.createElement('div');
            picker.id = 'amisearch-picker';
            picker.style.cssText = 'position:fixed; bottom:130px; right:20px; z-index:9999; background:white; padding:10px; border-radius:30px; display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:2px solid #6C5CE7;';
            
            Object.keys(themes).forEach(t => {
                const dot = document.createElement('div');
                dot.style.cssText = `width:25px; height:25px; border-radius:50%; background:${themes[t].primary}; cursor:pointer; border:2px solid #eee;`;
                dot.onclick = () => window.changeSiteTheme(t);
                picker.appendChild(dot);
            });
            document.body.appendChild(picker);
        }
        
        const saved = localStorage.getItem('amisearch-theme');
        if (saved) window.changeSiteTheme(saved);
    }

    // Futtatás betöltéskor
    setTimeout(applyFixes, 1500);
})();
