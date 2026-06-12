(function () {
  'use strict';

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = String(text || '');
    return div.innerHTML;
  }

  function lang() {
    return window.currentLang === 'en' ? 'en' : 'hu';
  }

  async function authHeaders(extra) {
    if (typeof window.getAuthHeaders === 'function') return window.getAuthHeaders(extra || {});
    return Object.assign({}, extra || {});
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && marked.parse) return marked.parse(String(text || ''));
    return esc(text).replace(/\n/g, '<br>');
  }

  function addDownloadToolbar(bubble, question) {
    if (!bubble || bubble.querySelector('[data-ai-dl-toolbar]')) return;
    const toolbar = document.createElement('div');
    toolbar.dataset.aiDlToolbar = '1';
    toolbar.className = 'flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap';
    const safeQ = window.sanitizeFilename ? window.sanitizeFilename(question || 'gemini-jegyzet-valasz') : 'gemini-jegyzet-valasz';
    toolbar.innerHTML =
      '<button onclick="window.downloadAiAnswerPdf && window.downloadAiAnswerPdf(this)" data-q="' + esc(safeQ).slice(0, 80) + '" class="text-xs px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium transition"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>' +
      '<button onclick="window.downloadAiAnswerWord && window.downloadAiAnswerWord(this)" data-q="' + esc(safeQ).slice(0, 80) + '" class="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition"><i class="fa-solid fa-file-word mr-1"></i>Word</button>' +
      '<button onclick="window.copyAiAnswer && window.copyAiAnswer(this)" class="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition"><i class="fa-regular fa-copy mr-1"></i>' + (lang() === 'hu' ? 'Másolás' : 'Copy') + '</button>';
    bubble.appendChild(toolbar);
  }

  function appendChatMessage(role, htmlOrText, isHtml) {
    const chatArea = document.getElementById('chatArea');
    if (!chatArea) return null;
    const id = 'gemini-note-msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
    if (role === 'user') {
      chatArea.insertAdjacentHTML('beforeend',
        '<div class="flex items-start space-x-3 mb-4 justify-end"><div class="bg-[#6C5CE7] text-white rounded-xl p-3 shadow-sm max-w-[80%]"><p class="text-sm">' + esc(htmlOrText) + '</p></div><div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-user text-white text-sm"></i></div></div>'
      );
      chatArea.scrollTop = chatArea.scrollHeight;
      return null;
    }
    chatArea.insertAdjacentHTML('beforeend',
      '<div class="flex items-start space-x-3 mb-4"><div class="w-8 h-8 bg-[#6C5CE7] rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-book-open-reader text-white text-sm"></i></div><div class="bg-white rounded-xl p-3 shadow-sm max-w-[88%]"><div class="text-sm" id="' + id + '">' + (isHtml ? htmlOrText : esc(htmlOrText)) + '</div></div></div>'
    );
    chatArea.scrollTop = chatArea.scrollHeight;
    return document.getElementById(id);
  }

  async function callGeminiNotes(payload) {
    const response = await fetch('/.netlify/functions/gemini-notes', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload || {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || ('HTTP ' + response.status));
    }
    return data;
  }

  window.askGeminiWithNotes = async function (question, options) {
    const payload = Object.assign({
      question: String(question || '').trim(),
      lang: lang(),
      mode: 'qa'
    }, options || {});
    return callGeminiNotes(payload);
  };

  window.askGeminiNotesFromChat = async function (noteId) {
    const input = document.getElementById('chatInput');
    const question = (input && input.value ? input.value : '').trim();
    const currentLang = lang();
    if (!question) {
      alert(currentLang === 'hu' ? 'Írd be a kérdésedet a chat mezőbe.' : 'Type your question first.');
      return;
    }

    const modal = document.getElementById('aiTutorModal');
    if (modal && typeof window.openModal === 'function') window.openModal('aiTutorModal');

    appendChatMessage('user', question, false);
    if (input) input.value = '';
    const target = appendChatMessage('assistant', '<span class="text-gray-400 animate-pulse">Jegyzetek olvasása Gemini segítségével...</span>', true);

    try {
      const data = await window.askGeminiWithNotes(question, noteId ? { noteId: String(noteId) } : {});
      if (!data.answer) throw new Error(currentLang === 'hu' ? 'A Gemini nem adott választ.' : 'Gemini returned no answer.');
      target.innerHTML = renderMarkdown(data.answer) +
        '<div class="mt-3 text-[11px] text-gray-400 border-t border-gray-100 pt-2">' +
        esc(currentLang === 'hu'
          ? ('Felhasznált jegyzetek: ' + (data.usedNotes || []).map(n => n.title).join(', '))
          : ('Used notes: ' + (data.usedNotes || []).map(n => n.title).join(', '))) +
        '</div>';
      if (window.renderMathInElement) {
        window.renderMathInElement(target, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\[', right: '\\]', display: true },
            { left: '\\(', right: '\\)', display: false }
          ],
          throwOnError: false
        });
      }
      window.chatHistory = window.chatHistory || [];
      window.chatHistory.push({ role: 'user', content: question });
      window.chatHistory.push({ role: 'assistant', content: data.answer });
      addDownloadToolbar(target.parentElement, question);
    } catch (error) {
      target.innerHTML = '<span class="text-red-600">' + esc(error && error.message ? error.message : String(error)) + '</span>';
    }
  };

  const oldOpenNoteInChat = window.openNoteInChat;
  window.openNoteInChat = function (noteId) {
    const currentLang = lang();
    const note = typeof window.findCachedNote === 'function' ? window.findCachedNote(noteId) : null;
    const input = document.getElementById('chatInput');
    if (!input) {
      if (typeof oldOpenNoteInChat === 'function') return oldOpenNoteInChat(noteId);
      alert(currentLang === 'hu' ? 'Chat ablak nem található.' : 'Chat panel not found.');
      return;
    }
    input.value = currentLang === 'hu'
      ? 'A saját feltöltött jegyzetem alapján válaszolj. Először készíts rövid vázlatot, majd tegyél fel 5 gyakorló kérdést. Jegyzet: ' + (note?.title || note?.originalName || String(noteId))
      : 'Answer using my uploaded note. First create a short outline, then ask 5 practice questions. Note: ' + (note?.title || note?.originalName || String(noteId));
    const modal = document.getElementById('aiTutorModal');
    if (modal && typeof window.openModal === 'function') window.openModal('aiTutorModal');
    input.focus();

    if (!document.getElementById('gemini-note-send-hint')) {
      const chatArea = document.getElementById('chatArea');
      if (chatArea) {
        chatArea.insertAdjacentHTML('beforeend', '<div id="gemini-note-send-hint" class="text-xs text-center text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-xl p-2 mb-3">' + esc(currentLang === 'hu' ? 'Tipp: a jegyzetalapú válaszhoz használd a Gemini jegyzet gombot, vagy nyomd meg az alábbi lila gombot.' : 'Tip: use the Gemini note button for note-grounded answers.') + '<br><button type="button" onclick="window.askGeminiNotesFromChat(' + JSON.stringify(String(noteId)) + ')" class="mt-2 px-3 py-1.5 rounded-lg bg-[#6C5CE7] text-white font-medium">Gemini jegyzetválasz</button></div>');
      }
    }
  };

  const oldSummarizeNote = window.summarizeNote;
  window.summarizeNote = async function (noteId, btn) {
    const currentLang = lang();
    const summaryBox = document.getElementById('my-note-summary-' + String(noteId));
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-60');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>' + (currentLang === 'hu' ? 'Gemini...' : 'Gemini...');
    }
    if (summaryBox) {
      summaryBox.classList.remove('hidden');
      summaryBox.innerHTML = '<div class="flex items-center gap-2 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i><span>' + esc(currentLang === 'hu' ? 'Gemini a jegyzet teljes szövegéből dolgozik...' : 'Gemini is reading the full note text...') + '</span></div>';
    }

    try {
      const data = await callGeminiNotes({
        noteId: String(noteId),
        lang: currentLang,
        mode: 'summary',
        question: currentLang === 'hu'
          ? 'Készíts vizsgára használható, tagolt összefoglalót ebből a jegyzetből, a végén 5 gyakorló kérdéssel.'
          : 'Create an exam-ready structured summary from this note, ending with 5 practice questions.'
      });
      if (summaryBox) {
        summaryBox.innerHTML = '<div class="flex items-center justify-between gap-2 mb-2"><strong class="text-gray-900">Gemini jegyzet-összefoglaló</strong><button onclick="window.copySummaryToChat && window.copySummaryToChat(' + JSON.stringify(String(noteId)) + ')" class="text-xs px-2 py-1 bg-indigo-50 text-[#6C5CE7] rounded-lg hover:bg-indigo-100"><i class="fa-solid fa-comments mr-1"></i>' + (currentLang === 'hu' ? 'Chatbe' : 'To chat') + '</button></div>' + renderMarkdown(data.answer || '');
        summaryBox.dataset.summary = data.answer || '';
      }
    } catch (error) {
      if (typeof oldSummarizeNote === 'function') {
        console.warn('Gemini summarize failed, fallback to old summarize:', error);
        return oldSummarizeNote(noteId, btn);
      }
      if (summaryBox) summaryBox.innerHTML = '<div class="text-red-600">' + esc(error && error.message ? error.message : String(error)) + '</div>';
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-60');
        btn.innerHTML = oldHtml;
      }
    }
  };
