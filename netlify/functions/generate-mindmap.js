<script>
// Inicializálás
mermaid.initialize({ 
  startOnLoad: false,
  theme: 'default',
  mindmap: { useMaxWidth: true }
});

let currentCode = '';
let currentTopic = '';

// URL paraméter ellenőrzése
const urlParams = new URLSearchParams(window.location.search);
const topicFromUrl = urlParams.get('topic');
if (topicFromUrl) {
  document.getElementById('topicInput').value = decodeURIComponent(topicFromUrl);
  generateMindmap();
}

async function generateMindmap() {
  const topic = document.getElementById('topicInput').value.trim();
  if (!topic) {
    alert('Kérlek adj meg egy témát!');
    return;
  }

  currentTopic = topic;
  showLoading();

  try {
    const resp = await fetch('/.netlify/functions/generate-mindmap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, lang: 'hu' })
    });

    if (!resp.ok) throw new Error('Szerver hiba: ' + resp.status);
    
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    if (!data.code) throw new Error('Üres válasz érkezett');

    currentCode = data.code;
    await renderMindmap(currentCode);
    showResult(topic);

  } catch (e) {
    console.error('Generálási hiba:', e);
    showError(e.message);
  }
}

// === JAVÍTÁS: Intelligens renderelés - ha színes nem megy, egyszerűt próbál ===
async function renderMindmap(code) {
  const container = document.getElementById('mindmapContainer');
  
  let cleanCode = code
    .replace(/^```mermaid\n?/, '')
    .replace(/^```\n?/, '')
    .replace(/```$/, '')
    .trim();
  
  if (!cleanCode.startsWith('mindmap')) {
    cleanCode = 'mindmap\n' + cleanCode;
  }

  // PRÓBA 1: Színes verzió (classDef-fel)
  const success = await tryRender(cleanCode, container);
  
  if (!success) {
    // PRÓBA 2: Egyszerű verzió (classDef nélkül)
    console.log('Színes verzió nem sikerült, egyszerű verziót próbálok...');
    const simpleCode = removeClassDefs(cleanCode);
    const success2 = await tryRender(simpleCode, container);
    
    if (!success2) {
      // PRÓBA 3: Ha minden más nem megy, szövegként jelenítjük meg
      container.innerHTML = '<pre class="text-sm text-gray-600 bg-gray-50 p-4 rounded-lg overflow-x-auto">' + cleanCode.replace(/</g, '&lt;') + '</pre>';
    }
  }
  
  document.getElementById('mermaidCode').value = cleanCode;
}

// Segédfüggvény: megpróbálja renderelni a kódot
async function tryRender(code, container) {
  const tempId = 'mermaid-' + Date.now();
  container.innerHTML = '<div id="' + tempId + '" class="mermaid-inner">\n' + code + '\n</div>';
  
  try {
    await mermaid.run({
      querySelector: '#' + tempId
    });
    // Ellenőrizzük, hogy tényleg renderelődött-e
    const svg = container.querySelector('svg');
    return svg && svg.innerHTML.length > 0;
  } catch (e) {
    console.warn('Renderelési próba sikertelen:', e.message);
    return false;
  }
}

// Segédfüggvény: eltávolítja a classDef-eket és a class hivatkozásokat
function removeClassDefs(code) {
  return code
    .replace(/classDef\s+\w+\s+[^;]+;/g, '')  // classDef definíciók
    .replace(/:::\w+/g, '')                     // class hivatkozások
    .replace(/\n\s*\n/g, '\n')                  // felesleges üres sorok
    .trim();
}

async function renderFromTextarea() {
  const code = document.getElementById('mermaidCode').value;
  currentCode = code;
  await renderMindmap(code);
}

function showLoading() {
  document.getElementById('inputSection').style.display = 'none';
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('error').style.display = 'none';
  document.getElementById('result').style.display = 'none';
}

function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'block';
  document.getElementById('errorText').textContent = msg;
}

function showResult(topic) {
  document.getElementById('loading').style.display = 'none';
  document.getElementById('result').style.display = 'block';
  document.getElementById('resultTitle').textContent = topic;
}

function resetForm() {
  document.getElementById('inputSection').style.display = 'block';
  document.getElementById('loading').style.display = 'none';
  document.getElementById('error').style.display = 'none';
  document.getElementById('result').style.display = 'none';
  document.getElementById('topicInput').value = '';
  document.getElementById('topicInput').focus();
}

function toggleCode() {
  const block = document.getElementById('codeBlock');
  const chev = document.getElementById('codeChevron');
  block.classList.toggle('hidden');
  chev.className = block.classList.contains('hidden') ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down';
}

function downloadSVG() {
  const svg = document.querySelector('#mindmapContainer svg');
  if (!svg) {
    alert('Először generáld le a gondolattérképet!');
    return;
  }
  
  const svgData = new XMLSerializer().serializeToString(svg);
  const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gondolatterkep_' + currentTopic.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') + '.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPNG() {
  const svg = document.querySelector('#mindmapContainer svg');
  if (!svg) {
    alert('Először generáld le a gondolattérképet!');
    return;
  }

  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  
  const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(svgBlob);
  
  img.onload = function() {
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    
    const pngUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = pngUrl;
    a.download = 'gondolatterkep_' + currentTopic.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  img.src = url;
}
</script>
