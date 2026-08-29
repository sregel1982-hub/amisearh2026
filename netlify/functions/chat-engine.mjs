// === CHAT ENGINE V2 - FIXED, szép ===

window.chatHistory = window.chatHistory || [];

function chatEscape(s){
  const d=document.createElement('div');
  d.textContent=s||'';
  return d.innerHTML;
}

window.appendBubble = function(role, htmlContent, isStreaming=false){
  const chatArea = document.getElementById('chatArea');
  const wrap = document.createElement('div');
  wrap.className = 'flex items-start space-x-3 mb-5 ' + (role==='user' ? 'justify-end' : '');
  
  if(role==='user'){
    wrap.innerHTML = `
      <div class="bg-[#6C5CE7] text-white rounded-2xl rounded-br-sm p-3.5 shadow-sm max-w-[85%] text-sm leading-relaxed">
        ${htmlContent}
      </div>
      <div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
        <i class="fa-solid fa-user text-white text-sm"></i>
      </div>`;
  } else {
    const id = isStreaming ? 'ai-stream-'+Date.now() : '';
    wrap.innerHTML = `
      <div class="w-8 h-8 bg-[#6C5CE7] rounded-full flex items-center justify-center flex-shrink-0 mt-1">
        <i class="fa-solid fa-wand-magic-sparkles text-white text-sm"></i>
      </div>
      <div class="bg-white rounded-2xl rounded-bl-sm p-4 shadow-sm border border-gray-100 max-w-[85%]">
        <div id="${id}" class="prose prose-sm max-w-none text-gray-800 leading-relaxed text-sm ai-output">${htmlContent}</div>
      </div>`;
    if(isStreaming) wrap._streamId = id;
  }
  chatArea.appendChild(wrap);
  chatArea.scrollTop = chatArea.scrollHeight;
  return wrap;
}

window.sendMessage = async function(){
  const input = document.getElementById('chatInput');
  const chatArea = document.getElementById('chatArea');
  const raw = input.value.trim();
  if(!raw) return;

  // 1. User bubble - szép
  window.appendBubble('user', chatEscape(raw));
  window.chatHistory.push({role:'user', content: raw});
  input.value = '';

  // 2. AI streaming bubble
  const streamingWrap = window.appendBubble('assistant', '<span class="inline-flex gap-1"><span class="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></span><span class="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style="animation-delay:.15s"></span><span class="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style="animation-delay:.3s"></span></span>', true);
  const streamId = streamingWrap._streamId;
  const streamEl = document.getElementById(streamId);

  try {
    const response = await window.fetchWithTimeout('/.netlify/functions/chat', {
      method: 'POST',
      headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ 
        message: raw, 
        history: window.chatHistory.slice(-10), 
        notes: window.uploadedNotes || '' 
      }),
    }, 60000);

    if(!response.ok){
      const err = await window.getAiErrorMessage(response, window.currentLang);
      streamEl.innerHTML = `<span class="text-amber-700 font-medium">${err}</span>`;
      return;
    }

    let fullText = '';
    let lastRender = 0;
    fullText = await window.readTextStream(response, (text) => {
      fullText = text;
      const now = Date.now();
      // csak 80ms-enként renderelünk, nem minden chunknál - ez szünteti meg a villogást
      if(now - lastRender > 80){
        streamEl.innerHTML = window.safeMarkdown ? window.safeMarkdown(fullText) : chatEscape(fullText);
        chatArea.scrollTop = chatArea.scrollHeight;
        lastRender = now;
      }
    });
    
    // végső render
    streamEl.innerHTML = window.safeMarkdown ? window.safeMarkdown(fullText) : chatEscape(fullText);
    window.chatHistory.push({role:'assistant', content: fullText});

    // KaTeX
    if(window.renderMathInElement){
      renderMathInElement(streamEl, { 
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\[', right: '\\]', display: true},
          {left: '\\(', right: '\\)', display: false}
        ], throwOnError: false 
      });
    }

    // Toolbar - csak egyszer, a végén
    const bubble = streamEl.closest('.bg-white');
    if(bubble && !bubble.querySelector('[data-ai-dl-toolbar]')){
      const tb = document.createElement('div');
      tb.dataset.aiDlToolbar = '1';
      tb.className = 'flex gap-2 mt-4 pt-3 border-t border-gray-100 flex-wrap';
      const safeQ = (window.sanitizeFilename ? window.sanitizeFilename(raw) : 'valasz').slice(0,40);
      tb.innerHTML = `
        <button onclick="window.downloadAiAnswerPdf(this)" data-q="${chatEscape(safeQ)}" class="text-xs px-3 py-1.5 bg-rose-50 text-rose-700 rounded-lg hover:bg-rose-100 font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>
        <button onclick="window.downloadAiAnswerWord(this)" data-q="${chatEscape(safeQ)}" class="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium"><i class="fa-solid fa-file-word mr-1"></i>Word</button>
        <button onclick="window.copyAiAnswer(this)" class="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 font-medium"><i class="fa-regular fa-copy mr-1"></i>Másolás</button>`;
      bubble.appendChild(tb);
    }

  } catch(e){
    streamEl.innerHTML = `<span class="text-red-500">Hiba: ${chatEscape(e.message||e)}</span>`;
  }
}
