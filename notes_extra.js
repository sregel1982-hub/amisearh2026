// --- Amisearch Extra Funkciók ---

// 1. Színválasztó a gondolattérképekhez (A gyerek ötlete)
window.currentMindMapTheme = 'default';

window.setMindMapTheme = function(theme) {
    window.currentMindMapTheme = theme;
    // Újra inicializáljuk a Mermaid-et a választott színnel
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({
            startOnLoad: false,
            theme: theme, // 'default', 'forest', 'dark', 'neutral'
            mindmap: { padding: 50 }
        });
        alert('Színmód átállítva: ' + theme);
    }
};

// 2. A gombok megjavítása (Letöltés és Összefoglaló)
window.downloadNote = async function(noteId) {
    try {
        const resp = await fetch('/.netlify/functions/download-note?id=' + noteId, {
            method: 'GET',
            headers: await window.getAuthHeaders({})
        });
        const data = await resp.json();
        if (data.url) window.open(data.url, '_blank');
    } catch (e) {
        console.error('Letöltési hiba');
    }
};

window.summarizeNote = async function(noteId, btn) {
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '...';
    try {
        await fetch('/.netlify/functions/summarize', {
            method: 'POST',
            headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ noteId: noteId })
        });
        alert('Az összefoglaló elkészült a chatben!');
    } catch (e) {
        alert('Hiba történt.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// 3. Automatikus javítás: Amisearh -> Amisearch csere a fejlécben
document.addEventListener('DOMContentLoaded', () => {
    const logo = document.body;
    if (logo) {
        logo.innerHTML = logo.innerHTML.replace(/Amisearh/g, 'Amisearch');
    }
});
