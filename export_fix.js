(function() {
    const themes = {
        blue: { primary: '#3B82F6', light: '#DBEAFE' },
        purple: { primary: '#6C5CE7', light: '#EFEEFF' },
        emerald: { primary: '#10B981', light: '#D1FAE5' },
        orange: { primary: '#F59E0B', light: '#FEF3C7' }
    };

    window.changeSiteTheme = function(themeName) {
        const theme = themes[themeName];
        if (!theme) return;
        let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
        styleTag.id = 'dynamic-theme-style';
        styleTag.innerHTML = `
            :root { --primary-color: ${theme.primary} !important; }
            /* Háttérszínek: gombok, fejlécek, badge-ek */
            header, .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, button[type="submit"], 
            .bg-purple-600, [class*="bg-purple-"], [class*="bg-indigo-"] { 
                background-color: ${theme.primary} !important; 
            }
            /* Szövegszínek */
            .text-indigo-600, .text-\\[\\#6C5CE7\\], .text-purple-600, 
            [class*="text-purple-"], [class*="text-indigo-"] { 
                color: ${theme.primary} !important; 
            }
            /* Keretszínek */
            .border-indigo-600, .border-\\[\\#6C5CE7\\], .border-purple-600, 
            [class*="border-purple-"], [class*="border-indigo-"] { 
                border-color: ${theme.primary} !important; 
            }
            /* Világos hátterek (kártyák alja, stb.) */
            .bg-indigo-50, .bg-purple-50 { background-color: ${theme.light} !important; }
            /* Ikonok átszínezése */
            svg, svg path, svg circle, .lucide { 
                stroke: ${theme.primary} !important; 
                fill: transparent; 
            }
            svg[fill*="#"], svg path[fill*="#"] { fill: ${theme.primary} !important; stroke: none !important; }
        `;
        document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    function runFix() {
        document.body.innerHTML = document.body.innerHTML.replace(/Amisearh|Amisrarh/g, 'Amisearch');
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
    setTimeout(runFix, 1000);
})();

    
    
