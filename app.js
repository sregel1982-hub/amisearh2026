
// 1. THEME COLOR PICKER (Szín választó)
const themes = {
    purple: { primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', name: '🟣 Purple' },
    blue: { primary: '#3B82F6', hover: '#2563EB', light: '#DBEAFE', name: '🔵 Blue' },
    emerald: { primary: '#10B981', hover: '#059669', light: '#D1FAE5', name: '🟢 Green' },
    orange: { primary: '#F59E0B', hover: '#D97706', light: '#FEF3C7', name: '🟠 Orange' },
    pink: { primary: '#EC4899', hover: '#DB2777', light: '#FCE7F3', name: '🔴 Pink' },
};

function initThemePicker() {
    const picker = document.createElement('div');
    picker.id = 'theme-picker';
    picker.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:10000; background:white; padding:15px; border-radius:50px; display:flex; gap:8px; box-shadow:0 8px 25px rgba(0,0,0,0.15); border:2px solid #eee;';
    
    Object.entries(themes).forEach(([key, theme]) => {
        const circle = document.createElement('button');
        circle.title = theme.name;
        circle.style.cssText = `width:35px; height:35px; border-radius:50%; background:${theme.primary}; cursor:pointer; border:3px solid white; transition:all 0.3s; font-size:18px;`;
        circle.textContent = theme.name.charAt(0);
        circle.onclick = () => applyTheme(key);
        circle.onmouseover = () => circle.style.transform = 'scale(1.15)';
        circle.onmouseout = () => circle.style.transform = 'scale(1)';
        picker.appendChild(circle);
    });
    document.body.appendChild(picker);
    
    // Load saved theme
    const saved = localStorage.getItem('amisearch-theme') || 'purple';
    applyTheme(saved);
}

function applyTheme(themeName) {
    const theme = themes[
