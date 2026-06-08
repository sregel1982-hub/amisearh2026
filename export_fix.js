(function() {
    // 1. SZÍNVÁLASZTÓ ÉS STÍLUSOK (A gyerek ötlete)
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
            .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, button[type="submit"] { background-color: ${theme.primary} !important; }
            .text-indigo-600, .text-\\[\\#6C5CE7\\] { color: ${theme.primary} !important; }
            .bg-indigo-50 { background-color: ${theme.light} !important; }
        `;
        if (!styleTag.parentElement) document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    // 2. NÉV JAVÍTÁSA ÉS SZÍNVÁLASZTÓ MEGJELENÍTÉSE
    function initExtra() {
        // Név javítása (Amisearh/Amisrarh -> Amisearch)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while(node = walker.nextNode()) {
            node.nodeValue = node.nodeValue.replace(/Amisearh|Amisrarh/g, 'Amisearch');
        }

        // Színválasztó körök
        const picker = document.createElement('div');
        picker.id = 'amisearch-color-picker';
        picker.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:10px; border-radius:30px; display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:2px solid #6C5CE7;';
        
        Object.keys(themes).forEach(name => {
            const circle = document.createElement('div');
            circle.style.cssText = `width:25px; height:25px; border-radius:50%; background:${themes[name].primary}; cursor:pointer; border:2px solid white;`;
            circle.onclick = () => window.changeSiteTheme(name);
            picker.appendChild(circle);
        });
        if (!document.getElementById('amisearch-color-picker')) {
            document.body.appendChild(picker);
        }

        const saved = localStorage.getItem('amisearch-theme');
        if (saved) window.changeSiteTheme(saved);
    }

    // 3. VALÓDI SZÖVEGES PDF ÉS WORD EXPORT (NEM KÉP)
    window.downloadAiAnswerPdf = function(btn) {
        const bubble = btn.closest('.ai-bubble, .bg-white, .message');
        if (!bubble) return;
        
        // Tisztítás: bevezető szöveg levágása
        let content = bubble.innerText || bubble.textContent;
        content = content.replace(/^(Rendben|Íme|Tessék|Oké|Szia).+?\n/i, "").trim();

        // Megnyitunk egy új ablakot a tiszta tartalommal a PDF mentéshez
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Amisearch Export</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 40px; line-height: 1.6; }
                .header { background: #6C5CE7; color: white; padding: 20px; text-align: center; margin-bottom: 30px; }
                .content { white-space: pre-wrap; }
            </style></head><body>
            <div class="header"><h1>Amisearch</h1></div>
            <div class="content">${content}</div>
            <script>window.onload = function() { window.print(); }</script>
            </body></html>
        `);
        win.document.close();
    };

    window.downloadAiAnswerWord = function(btn) {
        const bubble = btn.closest('.ai-bubble, .bg-white, .message');
        if (!bubble) return;
        
        let content = bubble.innerText || bubble.textContent;
        content = content.replace(/^(Rendben|Íme|Tessék|Oké|Szia).+?\n/i, "").trim();

        const html = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head><meta charset='utf-8'><style>body{font-family:Arial;}</style></head>
            <body><div style="background:#6C5CE7;color:white;padding:20px;text-align:center"><h1>Amisearch</h1></div>
            <p>${content.replace(/\n/g, '<br>')}</p></body></html>
        `;

        const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'amisearch-export.doc';
        a.click();
    };

    // Inicializálás
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtra);
    } else {
        initExtra();
    }
})();
