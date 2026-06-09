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
      header, .bg-indigo-600, .bg-\\[\\#6C5CE7\\], .btn-primary, button[type="submit"],
      .bg-purple-600, [class*="bg-purple-"], [class*="bg-indigo-"] {
        background-color: ${theme.primary} !important;
      }
      .text-indigo-600, .text-\\[\\#6C5CE7\\], .text-purple-600,
      [class*="text-purple-"], [class*="text-indigo-"] {
        color: ${theme.primary} !important;
      }
      .border-indigo-600, .border-\\[\\#6C5CE7\\], .border-purple-600,
      [class*="border-purple-"], [class*="border-indigo-"] {
        border-color: ${theme.primary} !important;
      }
      .bg-indigo-50, .bg-purple-50 { background-color: ${theme.light} !important; }
      svg, svg path, svg circle, .lucide {
        stroke: ${theme.primary} !important;
        fill: transparent;
      }
      svg[fill*="#"], svg path[fill*="#"] { fill: ${theme.primary} !important; stroke: none !important; }
    `;
    if (!styleTag.parentElement) document.head.appendChild(styleTag);
    localStorage.setItem('amisearch-theme', themeName);
  };

  function init() {
    const picker = document.createElement('div');
    picker.id = 'amisearch-picker';
    picker.style.cssText = 'position:fixed; bottom:20px; left:20px; z-index:10000; background:white; padding:10px; border-radius:30px; display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.2); border:2px solid #6C5CE7;';

    Object.keys(themes).forEach(name => {
      const circle = document.createElement('div');
      circle.style.cssText = `width:25px; height:25px; border-radius:50%; background:${themes[name].primary}; cursor:pointer; border:2px solid white;`;
      circle.onclick = () => window.changeSiteTheme(name);
      picker.appendChild(circle);
    });
    document.body.appendChild(picker);

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while(node = walker.nextNode()) {
      if (node.nodeValue.includes('Amisearh') || node.nodeValue.includes('Amisrarh')) {
        node.nodeValue = node.nodeValue.replace(/Amisearh|Amisrarh/g, 'Amisearch');
      }
    }

    const saved = localStorage.getItem('amisearch-theme');
    if (saved) window.changeSiteTheme(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.downloadNote = async function(id) {
    const resp = await fetch('/.netlify/functions/download-note?id=' + id, { headers: await window.getAuthHeaders({}) });
    const d = await resp.json();
    if (d.url) window.open(d.url, '_blank');
  };
})();
