// --- Amisearch Biztonsági Extra Fájl ---
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
            .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, button[type="submit"] { background-color: ${theme.primary} !important; }
            .text-indigo-600, .text-\\[\\#6C5CE7\\] { color: ${theme.primary} !important; }
            .bg-indigo-50 { background-color: ${theme.light} !important; }
        `;
        if (!styleTag.parentElement) document.head.appendChild(styleTag);
        localStorage.setItem('amisearch-theme', themeName);
    };

    function init() {
        // Színválasztó létrehozása
        const picker = document.createElement('div');
        picker.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:10px; border-radius:30px; display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.15);';
        
        Object.keys(themes).forEach(name => {
            const circle = document.createElement('div');
            circle.style.cssText = `width:25px; height:25px; border-radius:50%; background:${themes[name].primary}; cursor:pointer; border:2px solid white;`;
            circle.onclick = () => window.changeSiteTheme(name);
            picker.appendChild(circle);
        });
        document.body.appendChild(picker);

        // Név javítása (Amisearh/Amisrarh -> Amisearch)
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while(node = walker.nextNode()) {
            node.nodeValue = node.nodeValue.replace(/Amisearh|Amisrarh/g, 'Amisearch');
        }

        const saved = localStorage.getItem('amisearch-theme');
        if (saved) window.changeSiteTheme(saved);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Saját jegyzeteim betöltése
    window.loadMyNotes = async function() {
        const userId = localStorage.getItem('userId');
        if (!userId) return;

        try {
            const resp = await fetch(`/.netlify/functions/get-my-notes?userId=${userId}`);
            const data = await resp.json();
            
            if (data.success) {
                const notesList = document.getElementById('myNotesList');
                notesList.innerHTML = '';
                
                data.notes.forEach(note => {
                    const noteEl = document.createElement('div');
                    noteEl.className = 'bg-purple-50 rounded-lg p-4 flex items-center justify-between hover:bg-purple-100 transition';
                    noteEl.innerHTML = `
                        <div class="flex-1 min-w-0">
                            <p class="font-semibold text-sm text-gray-900 truncate">${note.title || 'Untitled'}</p>
                            <p class="text-xs text-gray-600">${note.subject || 'No subject'}</p>
                        </div>
                        <div class="flex gap-2 ml-3">
                            <button onclick="window.downloadNote('${note.id}', '${userId}')" title="Letöltés" class="text-blue-600 hover:text-blue-800 transition">
                                <i class="fa-solid fa-download"></i>
                            </button>
                            <button onclick="window.summarizeNote('${note.id}', '${userId}')" title="Összefoglalás" class="text-purple-600 hover:text-purple-800 transition">
                                <i class="fa-solid fa-sparkles"></i>
                            </button>
                        </div>
                    `;
                    notesList.appendChild(noteEl);
                });
            }
        } catch (error) {
            console.error('Failed to load notes:', error);
        }
    };

    // Jegyzet letöltése
    window.downloadNote = async function(noteId, userId) {
        try {
            const resp = await fetch(`/.netlify/functions/download-note?id=${noteId}&userId=${userId}`);
            const data = await resp.json();
            if (data.url) {
                window.open(data.url, '_blank');
            }
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    // Jegyzet összefoglalása
    window.summarizeNote = async function(noteId, userId) {
        try {
            const resp = await fetch(`/.netlify/functions/summarize-note`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ noteId, userId })
            });
            const data = await resp.json();
            if (data.success) {
                alert('Összefoglalás:\n\n' + data.summary);
            }
        } catch (error) {
            console.error('Summarize failed:', error);
        }
    };
})();
