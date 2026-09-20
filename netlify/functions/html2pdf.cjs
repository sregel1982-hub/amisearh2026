async function downloadFormattedPDF(title, rawMarkdownContent, sources = []) {
  // 1. Markdown átalakítása formázott HTML-lé (marked.js használatával)
  const formattedBody = typeof marked !== 'undefined' 
    ? marked.parse(rawMarkdownContent) 
    : rawMarkdownContent;

  // 2. Források összerakása HTML-ben
  let sourcesHtml = '';
  if (sources && sources.length > 0) {
    sourcesHtml = `
      <div class="pdf-sources">
        <h3>Forrásjegyzék</h3>
        <ul>
          ${sources.map(s => `<li><strong>${s.title}</strong><br><a href="${s.url}">${s.url}</a></li>`).join('')}
        </ul>
      </div>
    `;
  }

  // 3. Ideiglenes HTML elem létrehozása a PDF rendereléshez
  const element = document.createElement('div');
  element.className = 'pdf-export-container';
  
  const currentDate = new Date().toLocaleString('hu-HU');

  element.innerHTML = `
    <div class="pdf-header">
      <div>
        <h1 class="pdf-title">AMISEARCH</h1>
        <div style="font-size: 13px; color: #4b5563;">Tanulási segédlet</div>
      </div>
      <div class="pdf-meta">
        <div><strong>Típus:</strong> AI válasz</div>
        <div><strong>Dátum:</strong> ${currentDate}</div>
      </div>
    </div>

    <div class="pdf-content">
      ${formattedBody}
    </div>

    ${sourcesHtml}

    <div class="pdf-footer">
      amisearch.org — Készült az AMISEARCH intelligens tanulási platformmal
    </div>
  `;

  // 4. html2pdf opciók beállítása
  const opt = {
    margin:       [10, 10, 10, 10], // felső, bal, alsó, jobb margó (mm)
    filename:     `${title.toLowerCase().replace(/\s+/g, '_')}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
  };

  // 5. Letöltés futtatása
  html2pdf().set(opt).from(element).save();
}

