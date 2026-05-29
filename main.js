  window.currentLang = localStorage.getItem('lang') || 'hu';
  window.chatHistory = [];
  window.userProfile = null;

  // --- Header Dashboard ---
  window.toggleHeaderDashboard = function() {
    const dropdown = document.getElementById('headerDropdown');
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      window.updateLangButtons();
    }
  }

  document.addEventListener('click', function(e) {
    const dashboard = document.getElementById('headerDashboard');
    const dropdown = document.getElementById('headerDropdown');
    if (dashboard && dropdown && !dashboard.contains(e.target)) {
      dropdown.classList.add('hidden');
    }
  });

  window.setDropdownLang = function(lang) {
    window.toggleLang(lang);
    window.updateLangButtons();
  }

  window.updateLangButtons = function() {
    const btnHu = document.getElementById('btn-hu');
    const btnEn = document.getElementById('btn-en');
    if (!btnHu || !btnEn) return;
    const isHu = window.currentLang === 'hu';
    btnHu.setAttribute('data-active', isHu ? 'true' : 'false');
    btnEn.setAttribute('data-active', isHu ? 'false' : 'true');
    btnHu.className = 'flex-1 py-2 rounded-[14px] font-medium text-sm transition-all ' + (isHu ? 'bg-white shadow' : '');
    btnEn.className = 'flex-1 py-2 rounded-[14px] font-medium text-sm transition-all ' + (!isHu ? 'bg-white shadow' : '');
  }

  window.updateDashboardUI = function(profile) {
    if (!profile) return;
    window.userProfile = profile;
    const username = profile.username || profile.fullName || 'User';
    const initial = username.charAt(0).toUpperCase();
    const statusLabel = profile.status === 'teacher'
      ? (window.currentLang === 'hu' ? 'Tanár' : 'Teacher')
      : (window.currentLang === 'hu' ? 'Diák' : 'Student');

    document.getElementById('headerAvatar').textContent = initial;
    document.getElementById('headerUsername').textContent = username;
    document.getElementById('headerPlan').textContent = '• ' + (profile.plan || 'Free');
    const headerStatusEl = document.getElementById('headerStatusLabel');
    if (headerStatusEl) headerStatusEl.textContent = statusLabel;

    document.getElementById('dropdownAvatar').textContent = initial;
    document.getElementById('dropdownName').textContent = profile.fullName || username;
    document.getElementById('dropdownStatus').textContent = statusLabel;
    document.getElementById('dropdownPoints').textContent = profile.points || '0';
    document.getElementById('dropdownPlan').textContent = profile.plan || 'Free';

    document.getElementById('mobileAvatar').textContent = initial;
    document.getElementById('mobileUsername').textContent = username;
    document.getElementById('mobilePlan').textContent = profile.plan || 'Free';
    document.getElementById('mobilePoints').textContent = profile.points || '0';

    const heroDash = document.getElementById('heroDashboard');
    if (heroDash) {
      heroDash.classList.remove('hidden');
      document.getElementById('dashName').textContent = username;
      document.getElementById('dashAvatar').textContent = initial;
      document.getElementById('dashStatus').textContent = statusLabel;
      document.getElementById('dashPoints').textContent = profile.points || '0';
      document.getElementById('dashSub').textContent = profile.plan || 'Free';
    }

    document.getElementById('dashboardAvatar').textContent = initial;
    document.getElementById('dashboardFullName').textContent = profile.fullName || username;
    document.getElementById('dashboardStatus').textContent = statusLabel;
    document.getElementById('dashboardPlan').textContent = profile.plan || 'Free';
    document.getElementById('dashboardPoints').textContent = profile.points || '0';
    document.getElementById('dashboardSub').textContent = profile.plan || 'Free';
  }

  window.waitForSupabaseClient = async function(timeoutMs) {
    const started = Date.now();
    const timeout = timeoutMs || 5000;
    while (Date.now() - started < timeout) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  window.getAuthHeaders = async function(extra) {
    var headers = extra ? Object.assign({}, extra) : {};
    var supabase = window.supabaseClient || await window.waitForSupabaseClient(3000);
    if (supabase) {
      try {
        var sessionResult = await supabase.auth.getSession();
        var token = sessionResult.data.session ? sessionResult.data.session.access_token : null;
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
      } catch (e) {}
    }
    return headers;
  }

  window.getAiErrorMessage = async function(response, lang) {
    var fallback = lang === 'hu' ? 'AI válasz nem érhető el.' : 'AI response not available.';
    try {
      var contentType = response.headers.get('content-type') || '';
      var data = contentType.includes('application/json') ? await response.json() : null;
      if (response.status === 401) {
        return lang === 'hu' ? 'A kereséshez vagy AI chathez jelentkezz be újra.' : 'Please log in again to use search or AI chat.';
      }
      if (response.status === 503 || (data && data.code === 'ai_unavailable')) {
        return lang === 'hu' ? 'Az AI szolgáltatás jelenleg nincs beállítva vagy nem elérhető.' : 'The AI service is not configured or currently unavailable.';
      }
      if (data && data.error) {
        return data.error;
      }
    } catch (e) {}
    return fallback;
  }

  window.fetchWithTimeout = async function(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs || 45000);
    try {
      return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
    } finally {
      clearTimeout(timer);
    }
  }

  window.readTextStream = async function(response, onChunk) {
    if (!response.body) {
      const text = await response.text();
      if (text) onChunk(text);
      return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      fullText += decoder.decode(chunk.value, { stream: true });
      onChunk(fullText);
    }

    const tail = decoder.decode();
    if (tail) {
      fullText += tail;
      onChunk(fullText);
    }

    return fullText;
  }

  window.downloadWithAuth = async function(fileName, displayName) {
    try {
      const res = await fetch('/.netlify/functions/download?file=' + fileName, {
        headers: await window.getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = displayName || fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Download error:', e);
      alert(window.currentLang === 'hu' ? 'Letöltési hiba. Kérjük, próbálja újra.' : 'Download failed. Please try again.');
    }
  }

  window.loadUserProfile = async function() {
    try {
      const res = await fetch('/.netlify/functions/user-profile', {
        headers: await window.getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          window.updateDashboardUI(data.profile);
          // Saját jegyzeteket is betöltjük a dashboard panelbe
          try { if (typeof window.loadMyNotes === 'function') window.loadMyNotes(); } catch (e) {}
        }
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
  }

  window.awardPoints = async function(reason) {
    try {
      const res = await fetch('/.netlify/functions/award-points', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (window.userProfile) {
          window.userProfile.points = data.points;
          window.updateDashboardUI(window.userProfile);
        }
      }
    } catch (e) {
      console.error('Failed to award points:', e);
    }
  }

  // --- UI and other non-auth logic ---
  window.hideLoginMsgs = function() {
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('loginSuccess').classList.add('hidden');
  }
  window.showLoginMsg = function(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  window.hideRegisterMsgs = function() {
    document.getElementById('registerError').classList.add('hidden');
    document.getElementById('registerSuccess').classList.add('hidden');
  }
  window.showRegisterMsg = function(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  window.toggleLang = function(lang) {
    if (lang) {
      window.currentLang = lang;
    } else {
      window.currentLang = window.currentLang === 'hu' ? 'en' : 'hu';
    }
    localStorage.setItem('lang', window.currentLang);
    document.getElementById('langText').textContent = window.currentLang.toUpperCase();
    document.documentElement.lang = window.currentLang;
    document.querySelectorAll('[data-hu]').forEach(el => {
      el.textContent = el.getAttribute('data-' + window.currentLang);
    });
    document.querySelectorAll('[data-hu-placeholder]').forEach(el => {
      el.placeholder = el.getAttribute('data-' + window.currentLang + '-placeholder');
    });
  }

  // Initialize UI language on load
  window.addEventListener('DOMContentLoaded', () => {
    window.toggleLang(window.currentLang);
  });

  /* Free kredit lejárt figyelmeztetés – meghívható a kvótakezelő logikából */
  window.showFreeExpiredWarning = function() {
    const banner = document.getElementById('freeExpiredBanner');
    if (banner) banner.classList.remove('hidden');
  };
  window.hideFreeExpiredWarning = function() {
    const banner = document.getElementById('freeExpiredBanner');
    if (banner) banner.classList.add('hidden');
  };

  window.toggleMobileMenu = function() {
    document.getElementById('mobileMenu').classList.toggle('hidden');
  }

  window.openModal = function(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  window.closeModal = function(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
  }

  window.switchToRegister = function() {
    window.closeModal('loginModal');
    setTimeout(() => window.openModal('registerModal'), 100);
  }

  window.switchToLogin = function() {
    window.closeModal('registerModal');
    setTimeout(() => window.openModal('loginModal'), 100);
  }

  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) window.closeModal(modal.id);
    });
  });

  window.toggleFaq = function(el) {
    const wasActive = el.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(item => {
      item.classList.remove('active');
      item.querySelector('.fa-chevron-down').style.transform = 'rotate(0deg)';
    });
    if (!wasActive) {
      el.classList.add('active');
      el.querySelector('.fa-chevron-down').style.transform = 'rotate(180deg)';
    }
  }

  // --- Upload Box Drag & Drop ---
  const uploadBox = document.getElementById('uploadBox');
  const dashUploadBox = document.getElementById('dashUploadBox');
  const fileInput = document.getElementById('fileInput');

  function attachUploadBox(box, boxId) {
    if (!box) return;
    box.addEventListener('dragover', (e) => {
      e.preventDefault();
      window.activeUploadBoxId = boxId;
      box.classList.add('dragover');
    });

    box.addEventListener('dragleave', () => {
      box.classList.remove('dragover');
    });

    box.addEventListener('drop', (e) => {
      e.preventDefault();
      window.activeUploadBoxId = boxId;
      box.classList.remove('dragover');
      const dropped = e.dataTransfer.files;
      if (dropped && dropped[0]) {
        // Megnyitjuk a modalt és bekészítjük a fájlt
        window.openUploadModal(boxId);
        const modalFileInput = document.getElementById('uploadFileInput');
        if (modalFileInput) {
          const dt = new DataTransfer();
          dt.items.add(dropped[0]);
          modalFileInput.files = dt.files;
          // Cím auto-kitöltés a fájlnévből (kiterjesztés nélkül)
          const titleEl = document.getElementById('uploadTitle');
          if (titleEl && !titleEl.value) {
            titleEl.value = dropped[0].name.replace(/\.[^.]+$/, '').slice(0, 200);
          }
        }
      }
    });
  }

  attachUploadBox(uploadBox, 'uploadBox');
  attachUploadBox(dashUploadBox, 'dashUploadBox');

  /* Régi rejtett fileInput változatlan - ha valaki kívülről ezt használja */
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files;
      if (f && f[0]) {
        window.openUploadModal(window.activeUploadBoxId || 'uploadBox');
        const modalFileInput = document.getElementById('uploadFileInput');
        if (modalFileInput) {
          const dt = new DataTransfer();
          dt.items.add(f[0]);
          modalFileInput.files = dt.files;
          const titleEl = document.getElementById('uploadTitle');
          if (titleEl && !titleEl.value) {
            titleEl.value = f[0].name.replace(/\.[^.]+$/, '').slice(0, 200);
          }
        }
      }
      e.target.value = '';
    });
  }

  window.uploadedNotes = window.uploadedNotes || "";
  window.parsedPdfNotes = window.parsedPdfNotes || [];
  window.activeUploadBoxId = 'uploadBox';

  /* ─── Upload modal megnyitás ─────────────────────────────────── */
  window.openUploadModal = function(activeBoxId) {
    if (!window.currentUser) {
      window.openModal('loginModal');
      return;
    }
    window.activeUploadBoxId = activeBoxId || 'uploadBox';
    const form = document.getElementById('uploadForm');
    if (form) form.reset();
    const status = document.getElementById('uploadModalStatus');
    if (status) { status.className = 'hidden text-sm rounded-lg p-3'; status.innerHTML = ''; }
    window.openModal('uploadModal');
  };

  /* ─── SHA-256 hash a kliens oldalon ─────────────────────────── */
  async function sha256Hex(arrayBuffer) {
    const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ─── Status helper ─────────────────────────────────────────── */
  function setUploadStatus(type, html) {
    const status = document.getElementById('uploadModalStatus');
    if (!status) return;
    const colors = {
      info: 'bg-blue-50 border border-blue-200 text-blue-800',
      success: 'bg-green-50 border border-green-200 text-green-800',
      warn: 'bg-amber-50 border border-amber-200 text-amber-800',
      error: 'bg-red-50 border border-red-200 text-red-800'
    };
    status.className = 'text-sm rounded-lg p-3 ' + (colors[type] || colors.info);
    status.innerHTML = html;
  }

  /* ─── Feltöltés indítás (modal submit) ──────────────────────── */
  window.submitUpload = async function() {
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';
    const t = (k) => ({
      need_login: { hu: 'Bejelentkezés szükséges.', en: 'Login required.' }[lang],
      need_title: { hu: 'A cím / téma megadása kötelező.', en: 'Title is required.' }[lang],
      need_subject: { hu: 'A tantárgy megadása kötelező.', en: 'Subject is required.' }[lang],
      need_file: { hu: 'Válassz egy fájlt.', en: 'Please choose a file.' }[lang],
      too_big: { hu: 'A fájl max. 20 MB lehet.', en: 'File max 20 MB.' }[lang],
      hashing: { hu: 'Fájl ellenőrzése (hash)...', en: 'Verifying file (hash)...' }[lang],
      uploading: { hu: 'Feltöltés a tárhelyre...', en: 'Uploading to storage...' }[lang],
      registering: { hu: 'Jegyzet regisztrálása...', en: 'Registering note...' }[lang],
      indexing: { hu: 'Plágium ellenőrzés és szövegindexelés...', en: 'Plagiarism check and text indexing...' }[lang],
      ok: { hu: 'Sikeres feltöltés!', en: 'Upload successful!' }[lang],
      duplicate: { hu: 'Ezt a fájlt már feltöltötted egyszer.', en: 'You have already uploaded this file.' }[lang]
    }[k]);

    if (!window.currentUser) { setUploadStatus('error', t('need_login')); return; }

    const title = document.getElementById('uploadTitle').value.trim();
    const subject = document.getElementById('uploadSubject').value.trim();
    const language = (document.querySelector('input[name="uploadLang"]:checked') || {}).value || 'hu';
    const fileInputEl = document.getElementById('uploadFileInput');
    const file = fileInputEl && fileInputEl.files && fileInputEl.files[0];

    if (!title) { setUploadStatus('error', t('need_title')); return; }
    if (!subject) { setUploadStatus('error', t('need_subject')); return; }
    if (!file) { setUploadStatus('error', t('need_file')); return; }
    if (file.size > 20 * 1024 * 1024) { setUploadStatus('error', t('too_big')); return; }

    const btn = document.getElementById('uploadSubmitBtn');
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); }

    try {
      /* 1) Hash */
      setUploadStatus('info', '<i class="fa-solid fa-spinner fa-spin mr-2"></i>' + t('hashing'));
      const arrayBuffer = await file.arrayBuffer();
      const fileHash = await sha256Hex(arrayBuffer);

      /* 2) Supabase Storage upload */
      setUploadStatus('info', '<i class="fa-solid fa-spinner fa-spin mr-2"></i>' + t('uploading'));
      let supabase = window.supabaseClient;
      if (!supabase) {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
        supabase = createClient(
          'https://rvgzvseejzbzmcqidnzc.supabase.co',
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Z3p2c2Vlanpiem1jcWlkbnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODE3NjQsImV4cCI6MjA5NDE1Nzc2NH0.4pSZIbNVMmqF63xMBcZolm0wzgdZvMp9_5jLqOjQzDQ'
        );
        window.supabaseClient = supabase;
      }

      const safeName = file.name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // ékezetek le
        .replace(/[^a-zA-Z0-9._-]/g, '_');                  // csak ASCII + . _ -
      const filePath = Date.now() + '_' + safeName;

      const { data: stData, error: stErr } = await supabase.storage
        .from('jegyzetek').upload(filePath, file);
      if (stErr) {
        console.error('Supabase storage error:', stErr);
        setUploadStatus('error', '<i class="fa-solid fa-triangle-exclamation mr-2"></i>' + (lang === 'hu' ? 'Tárhely hiba: ' : 'Storage error: ') + escapeHtml(stErr.message || JSON.stringify(stErr)));
        return;
      }
      const publicUrl = supabase.storage.from('jegyzetek').getPublicUrl(filePath).data.publicUrl;

      /* 3) /notes regisztráció (dedupe a backenden) */
      setUploadStatus('info', '<i class="fa-solid fa-spinner fa-spin mr-2"></i>' + t('registering'));
      const regResp = await fetch('/.netlify/functions/notes', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          fileName: filePath,
          originalName: file.name,
          publicUrl, fileSize: file.size,
          fileHash, title, subject, language
        })
      });

      if (regResp.status === 409) {
        const j = await regResp.json().catch(() => ({}));
        setUploadStatus('warn', '<i class="fa-solid fa-circle-info mr-2"></i>' + (j.message || t('duplicate')));
        // Töröljük a hibásan feltöltött másolatot
        try { await supabase.storage.from('jegyzetek').remove([filePath]); } catch (e) { /* ok */ }
        return;
      }
      if (!regResp.ok) {
        const txt = await regResp.text();
        setUploadStatus('error', '<i class="fa-solid fa-triangle-exclamation mr-2"></i>' + (lang === 'hu' ? 'Regisztrációs hiba: ' : 'Registration error: ') + escapeHtml(txt.slice(0, 200)));
        try { await supabase.storage.from('jegyzetek').remove([filePath]); } catch (e) {}
        return;
      }
      const regData = await regResp.json();

      /* 4) Index dokumentum (await — plágium pontszám miatt) */
      setUploadStatus('info', '<i class="fa-solid fa-spinner fa-spin mr-2"></i>' + t('indexing'));
      let plagScore = 0;
      let similar = [];
      try {
        const idxResp = await fetch('/.netlify/functions/index-document', {
          method: 'POST',
          headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ noteId: regData.id, fileName: filePath })
        });
        if (idxResp.ok) {
          const idx = await idxResp.json();
          plagScore = idx.plagiarismScore || 0;
          similar = idx.similar || [];
        }
      } catch (e) { console.warn('Index error (nem kritikus):', e); }

      /* 5) Frontend cache + pont jutalom */
      if (file.type === 'text/plain') {
        try { window.uploadedNotes += '\n[Fájl feltöltve: ' + file.name + '](' + publicUrl + ')\n' + (await file.text()); } catch {}
      }
      if (window.userProfile) await window.awardPoints('document_upload');

      /* 6) Eredmény üzenet */
      let msg = '<i class="fa-solid fa-check-circle mr-2"></i><b>' + t('ok') + '</b>';
      if (plagScore >= 80) {
        const list = similar.map(s => '<li>' + escapeHtml(s.title || '#' + s.id) + ' — ' + s.score + '%</li>').join('');
        msg += '<div class="mt-2 text-red-700"><b>⚠️ Plágium gyanús (' + plagScore + '%):</b><ul class="list-disc list-inside text-xs mt-1">' + list + '</ul></div>';
        setUploadStatus('error', msg);
      } else if (plagScore >= 50) {
        msg += '<div class="mt-2 text-amber-700">Részleges egyezés: <b>' + plagScore + '%</b> hasonló meglévő jegyzettel.</div>';
        setUploadStatus('warn', msg);
      } else {
        setUploadStatus('success', msg);
      }

      setTimeout(() => { try { window.closeModal('uploadModal'); } catch {} }, plagScore >= 50 ? 8000 : 2500);
    } catch (err) {
      console.error('Upload exception:', err);
      setUploadStatus('error', '<i class="fa-solid fa-triangle-exclamation mr-2"></i>' + (err && err.message ? err.message : String(err)));
    } finally {
      if (btn) { btn.disabled = false; btn.classList.remove('opacity-60'); }
    }
  };

  /* Régi handleFiles megőrizve kompatibilitás miatt – csak megnyitja a modalt */
  window.handleFiles = async function(files) {
    if (files && files[0]) {
      window.openUploadModal(window.activeUploadBoxId || 'uploadBox');
      const modalFileInput = document.getElementById('uploadFileInput');
      if (modalFileInput) {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        modalFileInput.files = dt.files;
        const titleEl = document.getElementById('uploadTitle');
        if (titleEl && !titleEl.value) {
          titleEl.value = files[0].name.replace(/\.[^.]+$/, '').slice(0, 200);
        }
      }
    }
  };


  // --- Global Supabase client ---
  window.supabaseClient = null;
  (async function initGlobalSupabase() {
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');
      window.supabaseClient = createClient(
        'https://rvgzvseejzbzmcqidnzc.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2Z3p2c2Vlanpiem1jcWlkbnpjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODE3NjQsImV4cCI6MjA5NDE1Nzc2NH0.4pSZIbNVMmqF63xMBcZolm0wzgdZvMp9_5jLqOjQzDQ'
      );
    } catch (e) {
      console.error('Supabase global init error:', e);
    }
  })();

  // --- Language detection ---
  window.detectSearchLang = function(query) {
    const hunChars = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;
    const hunWords = /\b(és|vagy|hogy|egy|nem|van|mit|hol|kérem|keresés|jegyzet|tantárgy|egyetem|vizsga|tétel|fejezet|oldal|összefoglaló)\b/i;
    if (hunChars.test(query) || hunWords.test(query)) return 'hu';
    return 'en';
  }

  // --- Search Supabase documents ---
  window.searchSupabaseDocuments = async function(query) {
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const resp = await fetch('/.netlify/functions/notes?' + params.toString(), {
        headers: await window.getAuthHeaders(),
      });
      if (!resp.ok) return [];
      const rows = await resp.json();
      return rows.map(function(row) {
        return {
          name: row.original_name,
          originalName: row.file_name,
          url: row.public_url,
          createdAt: row.created_at,
          size: row.file_size || 0,
        };
      });
    } catch (e) {
      console.error('Document search error:', e);
      return [];
    }
  }

  // --- Build document results HTML ---
  window.buildDocResultsHtml = function(docs, lang) {
    if (!docs || docs.length === 0) return '';
    const isHu = lang === 'hu';
    let html = '';
    for (const doc of docs) {
      const ext = doc.name.split('.').pop().toLowerCase();
      const langBadge = isHu
        ? '<span class="px-3 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full">Magyar</span>'
        : '<span class="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">English</span>';
      const sizeStr = doc.size > 1048576 ? (doc.size / 1048576).toFixed(1) + ' MB' : doc.size > 1024 ? (doc.size / 1024).toFixed(0) + ' KB' : doc.size + ' B';
      html += '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100">';
      html += '<div class="flex justify-between items-start">';
      html += '<div class="min-w-0 flex-1 mr-3">';
      html += '<h3 class="font-semibold text-lg truncate">' + escapeHtml(doc.name) + '</h3>';
      html += '<p class="text-sm text-gray-500">' + sizeStr + ' • ' + ext.toUpperCase() + '</p>';
      html += '</div>';
      html += langBadge;
      html += '</div>';
      html += '<div class="mt-4 flex gap-3">';
      html += '<button onclick="window.downloadWithAuth(\'' + encodeURIComponent(doc.originalName).replace(/'/g, "\\'") + '\', \'' + escapeHtml(doc.name).replace(/'/g, "\\'") + '\')" class="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-medium text-center text-sm transition cursor-pointer">';
      html += '<i class="fa-solid fa-download mr-2"></i>' + (isHu ? 'Letöltés' : 'Download');
      html += '</button>';
      html += '</div>';
      html += '</div>';
    }
    return html;
  }

  // --- Dashboard search handler ---
  window.runExternalSearch = async function(query, lang, includeForeign, targetEl) {
    if (!targetEl) return;
    try {
      const resp = await fetch('/.netlify/functions/external-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, lang, includeForeign: !!includeForeign })
      });
      if (!resp.ok) {
        let errMsg = (lang === 'hu' ? 'Külső keresés nem érhető el.' : 'External search unavailable.');
        try {
          const text = await resp.text();
          errMsg += ' [HTTP ' + resp.status + ']';
          if (text && text.length < 300) errMsg += ' ' + text.slice(0, 200);
        } catch {}
        targetEl.innerHTML = '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-2"></i>' + escapeHtml(errMsg) + '</div>';
        return;
      }
      const data = await resp.json();
      const results = (data && data.results) || [];
      if (!results.length) {
        targetEl.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center text-gray-500"><i class="fa-solid fa-globe text-3xl mb-2 text-gray-300"></i><p>' + (lang === 'hu' ? 'Nincs külső találat. Próbáld be a "Idegen nyelvű is" pipát.' : 'No external results. Try the foreign-language checkbox.') + '</p></div>';
        return;
      }
      let html = '<div class="text-sm text-gray-500 mb-2"><i class="fa-solid fa-globe mr-1"></i>' + (lang === 'hu' ? 'Külső akadémiai találatok' : 'External academic results') + ' (' + results.length + ')</div>';
      html += '<div class="space-y-3">';
      for (const r of results) {
        const langBadge = r.language === 'hu'
          ? '<span class="px-2 py-0.5 text-xs bg-emerald-100 text-emerald-700 rounded-full">Magyar</span>'
          : '<span class="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">English</span>';
        const srcBadge = '<span class="px-2 py-0.5 text-xs bg-purple-100 text-[#6C5CE7] rounded-full">' + escapeHtml(r.source || '') + '</span>';
        const year = r.year ? '<span class="text-xs text-gray-500">' + r.year + '</span>' : '';
        const authors = r.authors ? '<p class="text-xs text-gray-500 mt-1">' + escapeHtml(r.authors) + '</p>' : '';
        const abstract = r.abstract ? '<p class="text-sm text-gray-600 mt-2 line-clamp-3">' + escapeHtml(r.abstract) + '</p>' : '';
        const pdfBtn = r.pdfUrl
          ? '<a href="' + escapeHtml(r.pdfUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition"><i class="fa-solid fa-file-pdf"></i>PDF</a>'
          : '';
        const linkBtn = r.sourceUrl
          ? '<a href="' + escapeHtml(r.sourceUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition"><i class="fa-solid fa-arrow-up-right-from-square"></i>' + (lang === 'hu' ? 'Megnyitás' : 'Open') + '</a>'
          : '';
        html += '<div class="bg-white rounded-2xl p-4 shadow border border-gray-100">';
        html += '  <div class="flex items-start gap-2 mb-1 flex-wrap">' + srcBadge + langBadge + year + '</div>';
        html += '  <h4 class="font-semibold text-gray-900">' + escapeHtml(r.title || '') + '</h4>';
        html += authors + abstract;
        html += '  <div class="mt-3 flex gap-2 flex-wrap">' + pdfBtn + linkBtn + '</div>';
        html += '</div>';
      }
      html += '</div>';
      targetEl.innerHTML = html;
    } catch (e) {
      console.error('External search error:', e);
      targetEl.innerHTML = '<div class="text-gray-400 text-sm">' + (lang === 'hu' ? 'Külső keresés hiba.' : 'External search error.') + '</div>';
    }
  };

  /* ──────────────────────────────────────────────────────────────
     LemonSqueezy checkout indítása
     ────────────────────────────────────────────────────────────── */
  window.startCheckout = async function(variantKey) {
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';
    if (!window.currentUser) {
      window.openModal('loginModal');
      return;
    }
    const variant = variantKey || 'pro_1month';
    try {
      const resp = await fetch('/.netlify/functions/lemon-checkout?variant=' + encodeURIComponent(variant), {
        method: 'GET',
        headers: await window.getAuthHeaders({})
      });
      if (!resp.ok) {
        const t = await resp.text();
        let msg = lang === 'hu' ? 'Nem sikerült a fizetési oldal megnyitása. ' : 'Could not open checkout. ';
        try { const j = JSON.parse(t); msg += j.error || ''; } catch { msg += t.slice(0,200); }
        alert(msg);
        return;
      }
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(lang === 'hu' ? 'A fizetési URL hiányzik.' : 'Checkout URL missing.');
      }
    } catch (e) {
      alert((lang === 'hu' ? 'Hiba: ' : 'Error: ') + (e?.message || e));
    }
  };


  window.handleDashboardSearch = async function() {
    const input = document.getElementById('dashSearchInput');
    const resultsContainer = document.getElementById('dashSearchResults');
    const docResults = document.getElementById('dashDocResults');
    const aiResults = document.getElementById('dashAiResults');
    const icon = document.getElementById('dashSearchIcon');
    const query = input.value.trim();

    if (!query) return;

    const lang = window.detectSearchLang(query);

    if (!window.currentUser) {
      resultsContainer.classList.remove('hidden');
      docResults.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center"><i class="fa-solid fa-lock text-3xl mb-2 text-[#6C5CE7]"></i><p class="text-gray-600 mb-3">' + (lang === 'hu' ? 'A kereséshez bejelentkezés szükséges.' : 'Login required to search.') + '</p><button onclick="openModal(\'loginModal\')" class="btn-primary px-6 py-2 text-white rounded-xl font-semibold text-sm">' + (lang === 'hu' ? 'Belépés' : 'Login') + '</button></div>';
      aiResults.classList.add('hidden');
      return;
    }

    resultsContainer.classList.remove('hidden');
    docResults.innerHTML = '<div class="flex items-center space-x-2 text-gray-400 py-2"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Keresés a jegyzetekben...' : 'Searching notes...') + '</span></div>';
    aiResults.classList.remove('hidden');
    aiResults.innerHTML = '<div class="flex items-center space-x-2 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'AI válasz generálása...' : 'Generating AI response...') + '</span></div>';
    icon.className = 'fa-solid fa-spinner fa-spin';

    try {
      const docs = await window.searchSupabaseDocuments(query);
      if (docs && docs.length > 0) {
        docResults.innerHTML = '<div class="text-sm text-gray-500 mb-2">' + (lang === 'hu' ? docs.length + ' találat' : docs.length + ' result(s)') + '</div>' + window.buildDocResultsHtml(docs, lang);
      } else {
        docResults.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center text-gray-500"><i class="fa-solid fa-folder-open text-3xl mb-2 text-gray-300"></i><p>' + (lang === 'hu' ? 'Nincs találat a jegyzetekben.' : 'No results found in notes.') + '</p></div>';
      }
    } catch (e) {
      docResults.innerHTML = '<div class="text-red-500">' + (lang === 'hu' ? 'Hiba történt a keresés során.' : 'An error occurred during search.') + '</div>';
    }

    /* Külső akadémiai keresés (OpenAlex + arXiv) */
    const extEl = document.getElementById('dashExternalResults');
    if (extEl) {
      extEl.innerHTML = '<div class="flex items-center space-x-2 text-gray-400 py-2"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Keresés külső forrásokban...' : 'Searching external sources...') + '</span></div>';
      const includeForeign = document.getElementById('dashIncludeForeign')?.checked || false;
      window.runExternalSearch(query, lang, includeForeign, extEl);
    }

    try {
      const response = await window.fetchWithTimeout('/.netlify/functions/search', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: query, notes: window.uploadedNotes || '', lang: lang === 'hu' ? 'hu' : 'en' }),
      }, 45000);
      if (response.ok && response.body) {
        aiResults.innerHTML = '';
        var aiText = await window.readTextStream(response, function(text) {
          aiText = text;
          aiResults.innerHTML = typeof marked !== 'undefined' ? marked.parse(aiText) : escapeHtml(aiText);
        });
        if (!aiText) {
          aiResults.innerHTML = '<div class="text-gray-400 text-sm">' + (lang === 'hu' ? 'Az AI nem adott választ.' : 'AI returned no response.') + '</div>';
        }
      } else {
        aiResults.innerHTML = '<div class="text-gray-400 text-sm">' + escapeHtml(await window.getAiErrorMessage(response, lang)) + '</div>';
      }
    } catch (e) {
      aiResults.innerHTML = '<div class="text-gray-400 text-sm">' + (lang === 'hu' ? 'AI válasz nem érhető el vagy időtúllépés történt.' : 'AI response is unavailable or timed out.') + '</div>';
    } finally {
      icon.className = 'fa-solid fa-arrow-right';
    }
  }

  document.getElementById('dashSearchInput')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') window.handleDashboardSearch();
  });

  document.querySelectorAll('.dash-search-tag').forEach(function(tag) {
    tag.addEventListener('click', function() {
      const text = tag.textContent;
      document.getElementById('dashSearchInput').value = text;
      window.handleDashboardSearch();
    });
  });


  // --- AI Chat (streaming) ---
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  window.sanitizeMermaidCode = function(code) {
    const lines = code.split('\n');
    const result = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase() === 'mindmap') {
        result.push('mindmap');
        continue;
      }
      const leadingSpaces = line.search(/\S/);
      const level = Math.max(1, Math.round(leadingSpaces / 2));
      let text = trimmed.replace(/[{}|<>]/g, '').replace(/\[/g, '(').replace(/\]/g, ')');
      
      // Idézőjelekbe tesszük az ékezetes/nem-ASCII szöveget, hogy a mermaid
      // helyesen rendelje (különben elnyeli az ékezeteket)
      const hasNonAscii = /[^\x00-\x7F]/.test(text);
      if (hasNonAscii) {
        const rootDouble = text.match(/^root\(\(\s*"?([^")]+?)"?\s*\)\)$/i);
        const rootSingle = text.match(/^root\(\s*"?([^")]+?)"?\s*\)$/i);
        if (rootDouble) {
          text = 'root(("' + rootDouble[1].replace(/"/g, '') + '"))';
        } else if (rootSingle) {
          text = 'root("' + rootSingle[1].replace(/"/g, '') + '")';
        } else if (!text.startsWith('"')) {
          text = '"' + text.replace(/"/g, '') + '"';
        }
      }
      
      result.push('  '.repeat(level) + text);
    }
    return result.join('\n');
  }

  window.renderMindMapFallback = function(code) {
    const lines = code.split('\n').filter(l => l.trim());
    let html = '<div class="p-4 bg-gradient-to-br from-purple-50 to-white rounded-xl border border-purple-200">';
    html += '<div class="flex items-center gap-2 mb-3"><i class="fa-solid fa-brain text-[#6C5CE7]"></i><span class="font-bold text-[#6C5CE7] text-sm">Gondolattérkép</span></div>';
    html += '<div class="space-y-1">';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase() === 'mindmap' || trimmed === '```' || trimmed === '```mermaid') continue;
      const depth = Math.max(0, Math.floor((line.search(/\S/) || 0) / 2));
      let text = trimmed.replace(/^root\(\((.+)\)\)$/, '$1').replace(/\(\((.+)\)\)/, '$1').replace(/\((.+)\)/, '$1');
      const colors = ['#6C5CE7', '#A29BFE', '#74b9ff', '#55efc4', '#fdcb6e'];
      const color = colors[Math.min(depth, colors.length - 1)];
      const size = depth === 0 ? 'text-base font-bold' : depth === 1 ? 'text-sm font-semibold' : 'text-xs';
      html += '<div style="margin-left:' + (depth * 20) + 'px" class="flex items-center gap-2 py-0.5">';
      html += '<span style="background:' + color + '" class="w-2 h-2 rounded-full flex-shrink-0"></span>';
      html += '<span class="' + size + ' text-gray-700">' + escapeHtml(text) + '</span></div>';
    }
    html += '</div></div>';
    return html;
  }

  window.extractMindMapTopic = function(rawCode) {
    if (!rawCode) return 'Gondolattérkép';
    const patterns = [
      /root\s*\(\(\s*"?([^")\n]+?)"?\s*\)\)/i,
      /root\s*\(\s*"?([^")\n]+?)"?\s*\)/i,
      /root\s*\[\s*"?([^"\]\n]+?)"?\s*\]/i
    ];
    for (const p of patterns) {
      const m = rawCode.match(p);
      if (m && m[1]) return m[1].trim();
    }
    return 'Gondolattérkép';
  };

  window.sanitizeFilename = function(name) {
    return (name || 'Gondolatterkep')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 80);
  };

  window.downloadMindMapPdf = async function(btn) {
    const wrapper = btn.closest('div').previousElementSibling || btn.parentElement.parentElement.querySelector('.mermaid-render');
    if (!wrapper) return;
    const container = wrapper.parentElement ? wrapper.parentElement.querySelector('.mermaid-render') || wrapper : wrapper;
    try {
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>PDF';
      const canvas = await html2canvas(container, { backgroundColor: '#ffffff', scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait' });
      const pdfW = pdf.internal.pageSize.getWidth() - 20;
      const pdfH = (canvas.height * pdfW) / canvas.width;
      pdf.addImage(imgData, 'PNG', 10, 10, pdfW, pdfH);
      pdf.save(window.sanitizeFilename((btn.closest('div')?.parentElement?.dataset?.topic) || 'Gondolatterkep') + '-gondolatterkep.pdf');
    } catch (e) {
      console.error('PDF export error:', e);
    } finally {
      btn.innerHTML = '<i class="fa-solid fa-file-pdf mr-1"></i>PDF';
    }
  }

  window.downloadMindMapWord = function(btn) {
    const wrapper = btn.closest('div').previousElementSibling || btn.parentElement.parentElement.querySelector('.mermaid-render');
    if (!wrapper) return;
    const container = wrapper.parentElement ? wrapper.parentElement.querySelector('.mermaid-render') || wrapper : wrapper;
    const content = container.innerHTML || container.textContent;
    const htmlDoc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Gondolattérkép</title><style>body{font-family:Calibri,sans-serif;padding:20px;} svg{max-width:100%;}</style></head><body><h1>Gondolattérkép</h1>' + content + '</body></html>';
    const blob = new Blob([htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const topic = (btn.closest('div')?.parentElement?.dataset?.topic) || 'Gondolattérkép';
    a.download = window.sanitizeFilename(topic) + '-gondolatterkep.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ──────────────────────────────────────────────────────────────
     AI VÁLASZ letöltés PDF / Word formátumban + Másolás
     ────────────────────────────────────────────────────────────── */
  function _findAiBubbleFrom(btn) {
    // The toolbar lives inside the bubble; the answer paragraph is the first child <p>
    const bubble = btn.closest('.bg-white');
    if (!bubble) return null;
    return bubble;
  }

  function _aiBubbleHtml(bubble) {
    if (!bubble) return '';
    const clone = bubble.cloneNode(true);
    // remove the toolbar from the cloned content
    const tb = clone.querySelector('[data-ai-dl-toolbar]');
    if (tb) tb.remove();
    return clone.innerHTML.trim();
  }

  function _aiBubbleText(bubble) {
    if (!bubble) return '';
    const clone = bubble.cloneNode(true);
    const tb = clone.querySelector('[data-ai-dl-toolbar]');
    if (tb) tb.remove();
    return (clone.innerText || clone.textContent || '').trim();
  }

  window.downloadAiAnswerPdf = async function(btn) {
    const bubble = _findAiBubbleFrom(btn);
    if (!bubble) return;
    const q = btn.getAttribute('data-q') || 'ai-valasz';
    const text = _aiBubbleText(bubble);
    try {
      const { jsPDF } = window.jspdf || {};
      if (!jsPDF) { alert('PDF library hiányzik.'); return; }
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      const maxWidth = pdf.internal.pageSize.getWidth() - margin * 2;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('AmiSearh — AI válasz', margin, margin);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.text(new Date().toLocaleString(window.currentLang === 'hu' ? 'hu-HU' : 'en-US'), margin, margin + 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      const lines = pdf.splitTextToSize(text, maxWidth);
      let y = margin + 44;
      const lineHeight = 16;
      const pageHeight = pdf.internal.pageSize.getHeight();
      for (const line of lines) {
        if (y > pageHeight - margin) { pdf.addPage(); y = margin; }
        pdf.text(line, margin, y);
        y += lineHeight;
      }
      pdf.save((window.sanitizeFilename ? window.sanitizeFilename(q) : q) + '.pdf');
    } catch (e) {
      console.error(e);
      alert('PDF generálás hiba: ' + (e?.message || e));
    }
  };

  window.downloadAiAnswerWord = function(btn) {
    const bubble = _findAiBubbleFrom(btn);
    if (!bubble) return;
    const q = btn.getAttribute('data-q') || 'ai-valasz';
    const html = _aiBubbleHtml(bubble);
    const htmlDoc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>AI válasz</title><style>body{font-family:Calibri,Arial,sans-serif;padding:24px;line-height:1.5;} h1,h2,h3{color:#5A4BD1;} pre,code{background:#f4f4f4;padding:6px;border-radius:4px;} blockquote{border-left:3px solid #6C5CE7;padding-left:12px;color:#555;}</style></head><body><h1>AmiSearh — AI válasz</h1><p><i>' + new Date().toLocaleString() + '</i></p><hr/>' + html + '</body></html>';
    const blob = new Blob(['\ufeff' + htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (window.sanitizeFilename ? window.sanitizeFilename(q) : q) + '.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  window.copyAiAnswer = function(btn) {
    const bubble = _findAiBubbleFrom(btn);
    if (!bubble) return;
    const text = _aiBubbleText(bubble);
    try {
      navigator.clipboard.writeText(text);
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>' + (window.currentLang === 'hu' ? 'Másolva!' : 'Copied!');
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    } catch (e) { /* csendes */ }
  };

  /* ──────────────────────────────────────────────────────────────
     SAJÁT JEGYZETEK panel — listáz + 1-kattintásos összefoglaló
     ────────────────────────────────────────────────────────────── */
  window.loadMyNotes = async function() {
    const container = document.getElementById('myNotesList');
    if (!container) return;
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';
    container.innerHTML = '<div class="flex items-center gap-2 text-gray-400 text-sm"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Jegyzetek betöltése...' : 'Loading notes...') + '</span></div>';
    try {
      const resp = await fetch('/.netlify/functions/notes', {
        method: 'GET',
        headers: await window.getAuthHeaders({})
      });
      if (!resp.ok) {
        container.innerHTML = '<div class="text-sm text-red-500">' + (lang === 'hu' ? 'Hiba a lekéréskor.' : 'Failed to load.') + '</div>';
        return;
      }
      const all = await resp.json();
      const mine = Array.isArray(all)
        ? all.filter(n => n.uploaderIdentityId === window.currentUser?.id)
        : [];
      if (!mine.length) {
        container.innerHTML = '<div class="text-sm text-gray-500 italic">' + (lang === 'hu' ? 'Még nincs feltöltött jegyzeted.' : 'No notes yet.') + '</div>';
        return;
      }
      let html = '<div class="space-y-2">';
      for (const n of mine.slice(0, 15)) {
        const safeTitle = escapeHtml(n.title || n.originalName || ('Note #' + n.id));
        const subject = n.subject ? '<span class="text-xs text-gray-500 ml-2">' + escapeHtml(n.subject) + '</span>' : '';
        html += '<div class="flex items-center justify-between gap-2 p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition">' +
                '<div class="min-w-0 flex-1"><p class="text-sm font-medium text-gray-900 truncate">' + safeTitle + subject + '</p>' +
                (n.publicUrl ? '<a href="' + escapeHtml(n.publicUrl) + '" target="_blank" class="text-xs text-[#6C5CE7] hover:underline"><i class="fa-solid fa-download mr-1"></i>' + (lang === 'hu' ? 'Letöltés' : 'Download') + '</a>' : '') +
                '</div>' +
                '<button onclick="window.summarizeNote(' + n.id + ', this)" data-testid="summarize-note-' + n.id + '" class="text-xs px-3 py-1.5 bg-[#6C5CE7] hover:bg-[#5A4BD1] text-white font-medium rounded-lg transition whitespace-nowrap"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>' + (lang === 'hu' ? 'Összefoglaló' : 'Summarize') + '</button>' +
                '</div>';
      }
      html += '</div>';
      container.innerHTML = html;
    } catch (e) {
      container.innerHTML = '<div class="text-sm text-red-500">' + (lang === 'hu' ? 'Hiba történt.' : 'An error occurred.') + '</div>';
    }
  };

  window.summarizeNote = async function(noteId, btn) {
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';
    if (btn) { btn.disabled = true; btn.classList.add('opacity-60'); btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>...'; }
    try {
      // Lekérjük a jegyzetet
      const noteResp = await fetch('/.netlify/functions/notes', { headers: await window.getAuthHeaders({}) });
      const all = await noteResp.json();
      const note = (Array.isArray(all) ? all : []).find(n => n.id === noteId);
      if (!note || !note.textContent) {
        alert(lang === 'hu' ? 'A jegyzet szöveges tartalma még nem indexelt.' : 'Note text is not indexed yet.');
        return;
      }
      // Beletoljuk a chat-be: a chat történet alapján AI összefoglal
      const dashChatBtn = document.querySelector('[data-testid="open-chat-from-dashboard"]');
      const chatInput = document.getElementById('chatInput');
      if (chatInput) {
        chatInput.value = (lang === 'hu'
          ? 'Készíts részletes összefoglalót az alábbi jegyzetből (' + (note.title || note.originalName) + '). Strukturált felsorolással, kulcsfogalmakkal és példákkal. Szöveg:\n\n'
          : 'Create a detailed summary of the following note (' + (note.title || note.originalName) + '). Structured with bullet points, key concepts and examples. Text:\n\n')
          + note.textContent.slice(0, 8000);
        // Chat dialog megnyitás ha létezik
        const chatModal = document.getElementById('aiChatModal') || document.getElementById('aiTutorModal');
        if (chatModal) window.openModal(chatModal.id);
        await window.sendMessage();
      } else {
        alert(lang === 'hu' ? 'Chat ablak nem található.' : 'Chat panel not found.');
      }
    } catch (e) {
      alert((lang === 'hu' ? 'Hiba: ' : 'Error: ') + (e?.message || e));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-60');
        btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles mr-1"></i>' + (lang === 'hu' ? 'Összefoglaló' : 'Summarize');
      }
    }
  };

  /* ──────────────────────────────────────────────────────────────
     FELADAT generátor (deriválás → mintafeladat + megoldás)
     ────────────────────────────────────────────────────────────── */
  window.generatePractice = async function() {
    const lang = window.currentLang === 'hu' ? 'hu' : 'en';
    const topic = (document.getElementById('practiceTopicInput')?.value || '').trim();
    const count = parseInt(document.getElementById('practiceCountInput')?.value || '3', 10) || 3;
    const difficulty = document.getElementById('practiceDifficulty')?.value || 'medium';
    if (!topic) {
      alert(lang === 'hu' ? 'Adj meg egy témát!' : 'Please enter a topic!');
      return;
    }

    const out = document.getElementById('practiceOutput');
    if (out) out.innerHTML = '<div class="flex items-center gap-2 text-gray-400 py-4"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Feladatok generálása...' : 'Generating problems...') + '</span></div>';

    const prompt = (lang === 'hu')
      ? 'Generálj ' + count + ' db ' + difficulty + ' nehézségű mintafeladatot a következő témából: "' + topic + '". Minden feladat után add meg a részletes, lépésről-lépésre haladó megoldást is. Használj LaTeX matematikai formázást ($...$ vagy $$...$$). Strukturáld így: ## 1. Feladat ... ### Megoldás ... ## 2. Feladat ...'
      : 'Generate ' + count + ' ' + difficulty + ' difficulty practice problems on the topic: "' + topic + '". After each problem, provide a detailed step-by-step solution. Use LaTeX math formatting ($...$ or $$...$$). Structure: ## Problem 1 ... ### Solution ... ## Problem 2 ...';

    try {
      const resp = await window.fetchWithTimeout('/.netlify/functions/chat', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message: prompt, history: [], notes: '' })
      }, 60000);
      if (!resp.ok) {
        const m = await window.getAiErrorMessage(resp, lang);
        if (out) out.innerHTML = '<div class="text-red-500 text-sm">' + escapeHtml(m) + '</div>';
        return;
      }
      let full = '';
      if (out) out.innerHTML = '<div class="prose prose-sm max-w-none" id="practiceContent"></div><div id="practiceToolbar" class="flex gap-2 mt-3 pt-3 border-t border-gray-100"></div>';
      const target = document.getElementById('practiceContent');
      full = await window.readTextStream(resp, (text) => {
        full = text;
        if (target) target.innerHTML = typeof marked !== 'undefined' ? marked.parse(full) : escapeHtml(full);
      });
      if (window.renderMathInElement && target) {
        renderMathInElement(target, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}, {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}], throwOnError: false });
      }
      // Toolbar — PDF + Word + Másolás
      const tb = document.getElementById('practiceToolbar');
      if (tb) {
        const safeT = window.sanitizeFilename ? window.sanitizeFilename(topic) : topic.replace(/[^a-zA-Z0-9_-]/g,'_');
        tb.innerHTML =
          '<button onclick="window.downloadPracticePdf(\'' + safeT + '\')" class="text-xs px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>' +
          '<button onclick="window.downloadPracticeWord(\'' + safeT + '\')" class="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"><i class="fa-solid fa-file-word mr-1"></i>Word</button>';
      }
    } catch (e) {
      if (out) out.innerHTML = '<div class="text-red-500 text-sm">' + (lang === 'hu' ? 'Hiba: ' : 'Error: ') + escapeHtml(e?.message || String(e)) + '</div>';
    }
  };

  window.downloadPracticePdf = async function(topicName) {
    const target = document.getElementById('practiceContent');
    if (!target) return;
    const text = (target.innerText || target.textContent || '').trim();
    try {
      const { jsPDF } = window.jspdf || {};
      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const margin = 40;
      const maxW = pdf.internal.pageSize.getWidth() - margin * 2;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('AmiSearh — ' + topicName + ' — Feladatok', margin, margin);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(12);
      const lines = pdf.splitTextToSize(text, maxW);
      let y = margin + 30;
      const ph = pdf.internal.pageSize.getHeight();
      for (const l of lines) {
        if (y > ph - margin) { pdf.addPage(); y = margin; }
        pdf.text(l, margin, y); y += 16;
      }
      pdf.save(topicName + '-feladatok.pdf');
    } catch (e) { alert('Hiba: ' + e?.message); }
  };

  window.downloadPracticeWord = function(topicName) {
    const target = document.getElementById('practiceContent');
    if (!target) return;
    const html = target.innerHTML;
    const htmlDoc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>' + topicName + ' — Feladatok</title><style>body{font-family:Calibri,Arial,sans-serif;padding:24px;line-height:1.6;}h1,h2,h3{color:#5A4BD1;}code{background:#f4f4f4;padding:2px 6px;border-radius:4px;}</style></head><body><h1>' + topicName + ' — Feladatok</h1>' + html + '</body></html>';
    const blob = new Blob(['\ufeff' + htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = topicName + '-feladatok.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Chat file upload handler
  const chatFileInput = document.getElementById('chatFileInput');
  if (chatFileInput) {
    chatFileInput.addEventListener('change', async function(e) {
      if (e.target.files && e.target.files.length > 0) {
        const chatArea = document.getElementById('chatArea');
        const fileNames = Array.from(e.target.files).map(f => f.name).join(', ');
        chatArea.innerHTML += '<div class="flex items-start space-x-3 mb-4 justify-end"><div class="bg-purple-100 text-[#6C5CE7] rounded-xl p-3 shadow-sm max-w-[80%]"><p class="text-sm"><i class="fa-solid fa-paperclip mr-1"></i>' + escapeHtml(fileNames) + '</p></div></div>';
        chatArea.scrollTop = chatArea.scrollHeight;
        await window.handleFiles(e.target.files);
        chatArea.innerHTML += '<div class="flex items-start space-x-3 mb-4"><div class="w-8 h-8 bg-[#6C5CE7] rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-face-smile-beam text-white text-sm"></i></div><div class="bg-white rounded-xl p-3 shadow-sm"><p class="text-sm text-green-600"><i class="fa-solid fa-check-circle mr-1"></i>' + (window.currentLang === 'hu' ? 'Dokumentum feltöltve! Kérdezz bátran.' : 'Document uploaded! Feel free to ask.') + '</p></div></div>';
        chatArea.scrollTop = chatArea.scrollHeight;
        e.target.value = '';
      }
    });
  }

  window.sendMessage = async function() {
    const input = document.getElementById('chatInput');
    const chatArea = document.getElementById('chatArea');
    const message = input.value.trim();

    if (!message) return;

    chatArea.innerHTML += '<div class="flex items-start space-x-3 mb-4 justify-end"><div class="bg-[#6C5CE7] text-white rounded-xl p-3 shadow-sm max-w-[80%]"><p class="text-sm">' + escapeHtml(message) + '</p></div><div class="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-user text-white text-sm"></i></div></div>';

    window.chatHistory.push({ role: 'user', content: message });
    input.value = '';
    chatArea.scrollTop = chatArea.scrollHeight;

    const aiMsgId = 'ai-msg-' + Date.now();
    chatArea.innerHTML += '<div class="flex items-start space-x-3 mb-4"><div class="w-8 h-8 bg-[#6C5CE7] rounded-full flex items-center justify-center flex-shrink-0"><i class="fa-solid fa-face-smile-beam text-white text-sm"></i></div><div class="bg-white rounded-xl p-3 shadow-sm"><p class="text-sm" id="' + aiMsgId + '"><span class="text-gray-400 animate-pulse">▋</span></p></div></div>';
    chatArea.scrollTop = chatArea.scrollHeight;

    try {
      const response = await window.fetchWithTimeout('/.netlify/functions/chat', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ message, history: window.chatHistory.slice(-10), notes: window.uploadedNotes }),
      }, 45000);

      if (!response.ok) {
        throw new Error(await window.getAiErrorMessage(response, window.currentLang));
      }

      let fullText = '';
      const target = document.getElementById(aiMsgId);

      fullText = await window.readTextStream(response, function(text) {
        fullText = text;
        target.innerHTML = typeof marked !== 'undefined' ? marked.parse(fullText) : escapeHtml(fullText);
        chatArea.scrollTop = chatArea.scrollHeight;
      });

      if (!fullText) {
        throw new Error(window.currentLang === 'hu' ? 'Az AI nem adott választ.' : 'AI returned no response.');
      }

      window.chatHistory.push({ role: 'assistant', content: fullText });
      if (window.renderMathInElement) {
        renderMathInElement(target, { delimiters: [{left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false}, {left: '\\[', right: '\\]', display: true}, {left: '\\(', right: '\\)', display: false}], throwOnError: false });
      }

      /* AI válasz letöltése PDF/Word formátumban — minden válasz alá tesszük */
      try {
        const bubble = target.parentElement;
        if (bubble && !bubble.querySelector('[data-ai-dl-toolbar]')) {
          const toolbar = document.createElement('div');
          toolbar.dataset.aiDlToolbar = '1';
          toolbar.className = 'flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap';
          const safeQ = window.sanitizeFilename ? window.sanitizeFilename(message) : message.replace(/[^a-zA-Z0-9_-]/g,'_');
          toolbar.innerHTML =
            '<button onclick="window.downloadAiAnswerPdf(this)" data-q="' + escapeHtml(safeQ).slice(0,80) + '" class="text-xs px-3 py-1.5 bg-rose-100 text-rose-700 rounded-lg hover:bg-rose-200 font-medium transition"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button>' +
            '<button onclick="window.downloadAiAnswerWord(this)" data-q="' + escapeHtml(safeQ).slice(0,80) + '" class="text-xs px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium transition"><i class="fa-solid fa-file-word mr-1"></i>Word</button>' +
            '<button onclick="window.copyAiAnswer(this)" class="text-xs px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition"><i class="fa-regular fa-copy mr-1"></i>' + (window.currentLang === 'hu' ? 'Másolás' : 'Copy') + '</button>';
          bubble.appendChild(toolbar);
        }
      } catch (e) { /* csendes */ }

      if (window.mermaid) {
        const mermaidBlocks = target.querySelectorAll('.language-mermaid');
        for (const block of mermaidBlocks) {
          const raw = block.textContent;
          const parent = block.parentElement;
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          const mermaidDiv = document.createElement('div');
          mermaidDiv.className = 'mermaid-render';
          wrapper.appendChild(mermaidDiv);
          parent.replaceWith(wrapper);
          try {
            const id = 'mm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
            const sanitized = sanitizeMermaidCode(raw);
            wrapper.dataset.topic = window.extractMindMapTopic(raw);
            const { svg } = await mermaid.render(id, sanitized);
            mermaidDiv.innerHTML = svg;
            const toolbar = document.createElement('div');
            toolbar.className = 'flex gap-2 mt-2 justify-end';
            toolbar.innerHTML = '<button onclick="downloadMindMapPdf(this)" class="text-xs px-3 py-1.5 bg-purple-100 text-[#6C5CE7] rounded-lg hover:bg-purple-200 transition font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button><button onclick="downloadMindMapWord(this)" class="text-xs px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition font-medium"><i class="fa-solid fa-file-word mr-1"></i>Word</button>';
            wrapper.appendChild(toolbar);
          } catch (e) {
            wrapper.dataset.topic = window.extractMindMapTopic(raw);
            mermaidDiv.innerHTML = renderMindMapFallback(raw);
            const toolbar = document.createElement('div');
            toolbar.className = 'flex gap-2 mt-2 justify-end';
            toolbar.innerHTML = '<button onclick="downloadMindMapPdf(this)" class="text-xs px-3 py-1.5 bg-purple-100 text-[#6C5CE7] rounded-lg hover:bg-purple-200 transition font-medium"><i class="fa-solid fa-file-pdf mr-1"></i>PDF</button><button onclick="downloadMindMapWord(this)" class="text-xs px-3 py-1.5 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition font-medium"><i class="fa-solid fa-file-word mr-1"></i>Word</button>';
            wrapper.appendChild(toolbar);
          }
        }
      }
    } catch (err) {
      const target = document.getElementById(aiMsgId);
      target.textContent = err && err.message ? err.message : (window.currentLang === 'hu' ? 'Hiba történt. Próbáld újra.' : 'An error occurred. Please try again.');
      target.classList.add('text-red-500');
    }
  }

  document.getElementById('chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') window.sendMessage();
  });

  // --- Search (Supabase notes + AI) ---
  window.handleSearch = async function() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const icon = document.getElementById('searchIcon');
    const query = input.value.trim();

    if (!query) return;

    const lang = window.detectSearchLang(query);

    if (!window.currentUser) {
      results.classList.remove('hidden');
      results.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center"><i class="fa-solid fa-lock text-3xl mb-2 text-[#6C5CE7]"></i><p class="text-gray-600 mb-3">' + (lang === 'hu' ? 'A kereséshez bejelentkezés szükséges.' : 'Login required to search.') + '</p><button onclick="openModal(\'loginModal\')" class="btn-primary px-6 py-2 text-white rounded-xl font-semibold text-sm">' + (lang === 'hu' ? 'Belépés' : 'Login') + '</button></div>';
      return;
    }

    results.classList.remove('hidden');
    results.innerHTML = '<div id="heroDocResults"><div class="bg-white rounded-3xl p-5 shadow border border-gray-100 flex items-center justify-center"><div class="flex items-center space-x-2 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Keresés a jegyzetekben...' : 'Searching notes...') + '</span></div></div></div><div id="heroExternalResults" class="mt-4"></div><div id="heroAiResults" class="ai-output bg-white rounded-3xl p-5 shadow border border-gray-100 max-h-[500px] overflow-y-auto text-sm text-gray-700 mt-4"><div class="flex items-center space-x-2 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'AI válasz generálása...' : 'Generating AI response...') + '</span></div></div>';
    icon.className = 'fa-solid fa-spinner fa-spin';

    var heroDocResults = document.getElementById('heroDocResults');
    var heroAiResults = document.getElementById('heroAiResults');
    var heroExternalResults = document.getElementById('heroExternalResults');

    try {
      const docs = await window.searchSupabaseDocuments(query);
      if (docs && docs.length > 0) {
        heroDocResults.innerHTML = '<div class="text-sm text-gray-500 mb-2">' + (lang === 'hu' ? docs.length + ' találat' : docs.length + ' result(s)') + '</div>' + window.buildDocResultsHtml(docs, lang);
      } else {
        heroDocResults.innerHTML = '<div class="bg-white rounded-3xl p-5 shadow border border-gray-100 text-center text-gray-500"><i class="fa-solid fa-folder-open text-3xl mb-2 text-gray-300"></i><p>' + (lang === 'hu' ? 'Nincs találat a jegyzetekben.' : 'No results found in notes.') + '</p></div>';
      }
    } catch (e) {
      heroDocResults.innerHTML = '<div class="text-red-500 mt-2">' + (lang === 'hu' ? 'Hiba történt a keresés során.' : 'An error occurred during search.') + '</div>';
    }

    /* Külső akadémiai keresés (OpenAlex + arXiv) */
    if (heroExternalResults) {
      heroExternalResults.innerHTML = '<div class="flex items-center space-x-2 text-gray-400 py-2"><i class="fa-solid fa-spinner fa-spin"></i><span>' + (lang === 'hu' ? 'Keresés külső forrásokban...' : 'Searching external sources...') + '</span></div>';
      window.runExternalSearch(query, lang, false, heroExternalResults);
    }

    try {
      const response = await window.fetchWithTimeout('/.netlify/functions/search', {
        method: 'POST',
        headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ query: query, notes: window.uploadedNotes || '', lang: lang === 'hu' ? 'hu' : 'en' }),
      }, 45000);
      if (response.ok && response.body) {
        heroAiResults.innerHTML = '';
        var aiText = await window.readTextStream(response, function(text) {
          aiText = text;
          heroAiResults.innerHTML = typeof marked !== 'undefined' ? marked.parse(aiText) : escapeHtml(aiText);
        });
        if (!aiText) {
          heroAiResults.innerHTML = '<div class="text-gray-400 text-sm">' + (lang === 'hu' ? 'Az AI nem adott választ.' : 'AI returned no response.') + '</div>';
        }
      } else {
        heroAiResults.innerHTML = '<div class="text-gray-400 text-sm">' + escapeHtml(await window.getAiErrorMessage(response, lang)) + '</div>';
      }
    } catch (e) {
      heroAiResults.innerHTML = '<div class="text-gray-400 text-sm">' + (lang === 'hu' ? 'AI válasz nem érhető el vagy időtúllépés történt.' : 'AI response is unavailable or timed out.') + '</div>';
    } finally {
      icon.className = 'fa-solid fa-arrow-right';
    }
  }

  document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') window.handleSearch();
  });

  // --- Star Rating ---
  window.submitRating = async function(rating) {
    const stars = document.querySelectorAll('.rating-star');
    stars.forEach(s => {
      const star = parseInt(s.getAttribute('data-star'));
      s.classList.toggle('text-yellow-400', star <= rating);
      s.classList.toggle('text-gray-300', star > rating);
    });

    const resultEl = document.getElementById('ratingResult');
    resultEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>' + (window.currentLang === 'hu' ? 'Küldés...' : 'Submitting...');

    try {
      const res = await fetch('/.netlify/functions/site-rating', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      });
      const data = await res.json();
      // 5-csillag egyszeri bónusz (50 pont) — user-id-keyed + atomic
      if (rating === 5 && window.currentUser) {
        const flagKey = 'fiveStarBonusGiven_' + window.currentUser.id;
        if (!localStorage.getItem(flagKey)) {
          // ELŐSZÖR set, hogy ne legyen versenyhelyzet ha gyors klikkelés vagy refresh
          localStorage.setItem(flagKey, 'true');
          try {
            await window.awardPoints('five_star_rating');
          } catch (e) {
            // Ha az API hibázott, töröljük a flag-et hogy később újrapróbálhassa
            localStorage.removeItem(flagKey);
          }
        }
      }
      const avg = data.average ? data.average.toFixed(1) : '0';
      resultEl.innerHTML = (window.currentLang === 'hu'
        ? '<i class="fa-solid fa-check-circle text-green-500 mr-1"></i>Köszönjük! Átlag:<strong>' + avg + '</strong>/5 (' + data.total + ' értékelés)'
        : '<i class="fa-solid fa-check-circle text-green-500 mr-1"></i>Thank you! Average: <strong>' + avg + '</strong>/5 (' + data.total + ' ratings)');
    } catch (e) {
      resultEl.textContent = window.currentLang === 'hu' ? 'Hiba történt.' : 'An error occurred.';
    }
  }

  window.loadRatingAverage = async function() {
    try {
      const res = await fetch('/.netlify/functions/site-rating');
      const data = await res.json();
      if (data.total > 0) {
        const resultEl = document.getElementById('ratingResult');
        const avg = data.average ? data.average.toFixed(1) : '0';
        resultEl.innerHTML = (window.currentLang === 'hu'
          ? 'Átlag: <strong>' + avg + '</strong>/5 (' + data.total + ' értékelés)'
          : 'Average: <strong>' + avg + '</strong>/5 (' + data.total + ' ratings)');
      }
    } catch (e) {}
  }
  window.addEventListener('DOMContentLoaded', () => window.loadRatingAverage());

  document.querySelectorAll('.search-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const text = tag.textContent;
      document.getElementById('searchInput').value = text;
      window.handleSearch();
    });
  });
