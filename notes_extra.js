// --- Amisearch Teljes Oldal Színváltó és Javítások ---

(function() {
    // 1. Színstílusok definiálása
    const themes = {
        blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE' }, // Alap kék
        purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF' }, // Lila
        emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5' }, // Smaragd zöld
        orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7' }  // Narancs
    };

    // 2. Függvény a szín átállítására
    window.changeSiteTheme = function(themeName) {
        const theme = themes[themeName];
        if (!theme) return;

        // Létrehozunk egy stílus blokkot, ami felülírja a Tailwind színeket
        let styleTag = document.getElementById('dynamic-theme-style');
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = 'dynamic-theme-style';
            document.head.appendChild(styleTag);
        }

        // Felülírjuk a fő színeket az oldalon
        styleTag.innerHTML = `
            :root {
                --primary-color: ${theme.primary} !important;
            }
            .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary { 
                background-color: ${theme.primary} !important; 
            }
            .text-indigo-600, .text-\\[\\#6C5CE7\\] { 
                color: ${theme.primary} !important; 
            }
            .hover\\:bg-indigo-700:hover, .hover\\:bg-\\[\\#5A4BD1\\]:hover { 
                background-color: ${theme.hover} !important; 
            }
            .bg-indigo-50, .bg-purple-50 { 
                background-color: ${theme.light} !important; 
            }
            border-indigo-600, border-\\[\\#6C5CE7\\] {
                border-color: ${theme.primary} !important;
            }
        `;
        
        // Elmentjük a választást, hogy frissítés után is megmaradjon
        localStorage.setItem('amisearch-theme', themeName);
    };

    // 3. Színválasztó gombok létrehozása az oldal alján
    function createColorPicker() {
        const container = document.createElement('div');
        container.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:9999; background:white; padding:10px; border-radius:50px; shadow:0 4px 10px rgba(0,0,0,0.1); display:flex; gap:8px; border:1px solid #eee; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);';
        
        Object.keys(themes).forEach(name => {
            const btn = document.createElement('button');
            btn.style.cssText = `width:25px; height:25px; border-radius:50%; background:${themes[name].primary}; border:2px solid white; cursor:pointer; transition: transform 0.2s;`;
            btn.title = name;
            btn.onclick = () => window.changeSiteTheme(name);
            btn.onmouseover = () => btn.style.transform = 'scale(1.2)';
            btn.onmouseout = () => btn.style.transform = 'scale(1)';
            container.appendChild(btn);
        });

        document.body.appendChild(container);
    }

    // 4. Betöltéskor lefutó dolgok
    document.addEventListener('DOMContentLoaded', () => {
        // Név javítása
        document.body.innerHTML = document.body.innerHTML.replace(/Amisearh/g, 'Amisearch');
        
        // Színválasztó létrehozása
        createColorPicker();
        
        // Elmentett szín betöltése
        const savedTheme = localStorage.getItem('amisearch-theme');
        if (savedTheme) window.changeSiteTheme(savedTheme);
    });

    // --- Gombok javítása ---
    window.downloadNote = async function(noteId) {
        try {
            const resp = await fetch('/.netlify/functions/download-note?id=' + noteId, {
                method: 'GET',
                headers: await window.getAuthHeaders({})
            });
            const data = await resp.json();
            if (data.url) window.open(data.url, '_blank');
        } catch (e) { console.error(e); }
    };

    window.summarizeNote = async function(noteId, btn) {
        const orig = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '...';
        try {
            await fetch('/.netlify/functions/summarize', {
                method: 'POST',
                headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ noteId: noteId })
            });
            alert('Kész!');
        } catch (e) { alert('Hiba'); }
        finally { btn.disabled = false; btn.innerHTML = orig; }
    };
})();
