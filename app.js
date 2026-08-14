// ===== AMISEARCH APP.JS =====

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
    const theme = themes[themeName];
    if (!theme) return;
    
    let styleTag = document.getElementById('dynamic-theme-style') || document.createElement('style');
    styleTag.id = 'dynamic-theme-style';
    styleTag.innerHTML = `
        :root { 
            --primary: ${theme.primary} !important;
            --primary-dark: ${theme.hover} !important;
        }
        .btn-primary, button[type="submit"], .bg-indigo-600, .bg-\\[\\#6C5CE7\\] { 
            background-color: ${theme.primary} !important; 
        }
        .btn-primary:hover, button[type="submit"]:hover { 
            background-color: ${theme.hover} !important; 
        }
        .text-indigo-600, .text-\\[\\#6C5CE7\\], .gradient-text { 
            color: ${theme.primary} !important; 
        }
        .bg-indigo-50, .bg-purple-50 { 
            background-color: ${theme.light} !important; 
        }
        .border-purple-100 {
            border-color: ${theme.light} !important;
        }
        a { color: ${theme.primary} !important; }
    `;
    if (!styleTag.parentElement) document.head.appendChild(styleTag);
    localStorage.setItem('amisearch-theme', themeName);
}

// 2. PDF EXPORT WITH NICE FORMATTING
window.generatePracticeWithPDF = async function() {
    const topic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'közepes';
    const count = document.getElementById('practiceCountInput')?.value || 3;
    
    // Generate practice content (placeholder)
    const output = document.getElementById('practiceOutput');
    output.innerHTML = `<div class="text-center py-8"><i class="fa-solid fa-spinner fa-spin text-2xl text-purple-600"></i> <p class="mt-2">Feladatok generálása...</p></div>`;
    
    // Simulate AI generation
    setTimeout(() => {
        const content = `
<h2>${topic} - ${difficulty} szintű feladatok</h2>
<p>Ezek a feladatok a tanulásod támogatásához lettek generálva.</p>
${Array.from({length: parseInt(count)}, (_, i) => `
<div style="margin: 20px 0; padding: 15px; border-left: 4px solid #6C5CE7;">
    <strong>Feladat ${i+1}:</strong><br>
    Magyarázd meg a ${topic} alapelveit és add meg legalább 3 gyakorlati példát!
    <br><br>
    <em style="color: #666;">Megoldás: Ez a terület a ${difficulty} szintű tudásról szól...</em>
</div>
`).join('')}
        `;
        
        output.innerHTML = `<div class="prose-like">${content}</div>`;
        
        // Add download buttons
        const buttons = document.createElement('div');
        buttons.style.marginTop = '20px';
        buttons.innerHTML = `
            <button onclick="downloadPracticeAsPDF()" class="btn-primary text-white px-4 py-2 rounded mr-2">
                <i class="fa-solid fa-file-pdf"></i> PDF-ként letöltés
            </button>
            <button onclick="downloadPracticeAsWord()" class="bg-blue-600 text-white px-4 py-2 rounded">
                <i class="fa-solid fa-file-word"></i> Word-ként letöltés
            </button>
        `;
        output.appendChild(buttons);
    }, 1500);
};

// 3. PDF DOWNLOAD WITH PROPER FORMATTING
window.downloadPracticeAsPDF = async function() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    const topic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'közepes';
    const content = document.getElementById('practiceOutput')?.innerText || 'Feladatok';
    
    // Add nice header
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(108, 92, 231);
    doc.text('AMISEARCH', 20, 20);
    
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Gyakorló feladatok: ${topic}`, 20, 30);
    doc.text(`Szint: ${difficulty}`, 20, 38);
    doc.text(`Dátum: ${new Date().toLocaleDateString('hu-HU')}`, 20, 46);
    
    // Add separator line
    doc.setDrawColor(108, 92, 231);
    doc.line(20, 50, 190, 50);
    
    // Add content with line wrapping
    const lines = doc.splitTextToSize(content, 170);
    doc.setFontSize(10);
    doc.text(lines, 20, 58);
    
    // Save PDF
    doc.save(`${topic}_feladatok.pdf`);
};

window.downloadPracticeAsWord = async function() {
    const topic = document.getElementById('practiceTopicInput')?.value || 'Feladatok';
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'közepes';
    const content = document.getElementById('practiceOutput')?.innerText || 'Feladatok';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${topic} - Gyakorló feladatok</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        h1 { color: #6C5CE7; }
        .header { border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>AMISEARCH</h1>
        <h2>${topic} - ${difficulty} szintű feladatok</h2>
        <p>Dátum: ${new Date().toLocaleDateString('hu-HU')}</p>
    </div>
    <div>${content.replace(/\n/g, '<br>')}</div>
</body>
</html>
    `;
    
    const blob = new Blob([html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic}_feladatok.doc`;
    a.click();
};

// 4. INIT ON PAGE LOAD
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initThemePicker();
        window.generatePractice = window.generatePracticeWithPDF;
    });
} else {
    initThemePicker();
    window.generatePractice = window.generatePracticeWithPDF;
}

console.log('✅ AMISEARCH App initialized!');
