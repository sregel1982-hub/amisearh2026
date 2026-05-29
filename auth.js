  // --- Supabase Auth ---
  window.currentUser = null;
  window.authReady = false;

  function getSupabase() {
    return window.supabaseClient;
  }

  function authServiceMessage() {
    return window.currentLang === 'hu'
      ? 'A bejelentkezési szolgáltatás még nem érhető el. Frissítsd az oldalt, majd próbáld újra.'
      : 'The login service is not ready yet. Refresh the page and try again.';
  }

  function updateAuthUI(user) {
    window.currentUser = user || null;

    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const headerDashboard = document.getElementById('headerDashboard');
    const heroDashboard = document.getElementById('heroDashboard');
    const mobileLoginBtn = document.getElementById('mobileLoginBtn');
    const mobileUserSection = document.getElementById('mobileUserSection');
    const landingContent = document.getElementById('landingContent');
    const dashboardSection = document.getElementById('dashboardSection');

    if (user) {
      loginBtn.classList.add('hidden');
      registerBtn.classList.add('hidden');
      headerDashboard.classList.remove('hidden');
      if (mobileLoginBtn) mobileLoginBtn.classList.add('hidden');
      if (mobileUserSection) mobileUserSection.classList.remove('hidden');
      //if (landingContent) landingContent.classList.add('hidden');
      const heroSection = document.getElementById('heroSection');
      if (heroSection) heroSection.classList.add('hidden');
      if (dashboardSection) dashboardSection.classList.remove('hidden');
      window.loadUserProfile();
    } else {
      loginBtn.classList.remove('hidden');
      registerBtn.classList.remove('hidden');
      headerDashboard.classList.add('hidden');
      document.getElementById('headerDropdown').classList.add('hidden');
      if (mobileLoginBtn) mobileLoginBtn.classList.remove('hidden');
      if (mobileUserSection) mobileUserSection.classList.add('hidden');
      if (landingContent) landingContent.classList.remove('hidden');
      const heroSectionShow = document.getElementById('heroSection');
      if (heroSectionShow) heroSectionShow.classList.remove('hidden');
      if (dashboardSection) dashboardSection.classList.add('hidden');
      window.userProfile = null;
      if (heroDashboard) heroDashboard.classList.add('hidden');
    }
  }

  async function waitForSupabase() {
    if (window.waitForSupabaseClient) {
      return await window.waitForSupabaseClient(5000);
    }
    for (let i = 0; i < 50; i++) {
      if (window.supabaseClient) return window.supabaseClient;
      await new Promise(r => setTimeout(r, 100));
    }
    return null;
  }

  async function initAuth() {
    const supabase = await waitForSupabase();
    if (!supabase) {
      console.error('Supabase client not available');
      window.authReady = true;
      window.showLoginMsg?.('loginError', authServiceMessage());
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user || null;
    console.log('Auth init:', user ? user.email : 'no user');
    updateAuthUI(user);
    window.authReady = true;

    if (user) {
      const dash = document.getElementById('dashboardSection');
      if (dash) dash.scrollIntoView({ behavior: 'smooth' });
    }

    supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user || null;
      console.log('Auth event:', event, u ? u.email : null);
      updateAuthUI(u);
    });
  }

  initAuth();

  // --- Login ---
  window.handleLogin = async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginSubmitBtn');
    window.hideLoginMsgs();
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const supabase = getSupabase() || await waitForSupabase();
      if (!supabase) throw new Error(authServiceMessage());
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const user = data.user;
      window.currentUser = user;
      try {
        const profileRes = await fetch('/.netlify/functions/user-profile', {
          headers: await window.getAuthHeaders(),
        });
        const profileData = await profileRes.json();
        if (!profileData.profile) {
          await fetch('/.netlify/functions/user-profile', {
            method: 'POST',
            headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              fullName: (user.user_metadata && user.user_metadata.full_name) || email.split('@')[0],
              username: (user.user_metadata && user.user_metadata.username) || email.split('@')[0],
              status: (user.user_metadata && user.user_metadata.status) || 'student',
              email: email,
            }),
          });
        }
      } catch (profileErr) {
        console.error('Profile sync error:', profileErr);
      }
      updateAuthUI(user);
      window.closeModal('loginModal');
      document.getElementById('loginEmail').value = '';
      document.getElementById('loginPassword').value = '';
      const dash = document.getElementById('dashboardSection');
      if (dash) dash.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      const msg = (error.message && error.message.includes('Invalid login'))
        ? (window.currentLang === 'hu' ? 'Hibás email vagy jelszó.' : 'Invalid email or password.')
        : (error.message || (window.currentLang === 'hu' ? 'A szolgáltatás nem elérhető.' : 'Service not available.'));
      window.showLoginMsg('loginError', msg);
    } finally {
      btn.disabled = false;
      btn.textContent = window.currentLang === 'hu' ? 'Belépés' : 'Login';
    }
  }

  // --- Register ---
  window.handleRegister = async function(e) {
    e.preventDefault();
    const name = document.getElementById('registerName').value;
    const username = document.getElementById('registerUsername').value;
    const status = document.getElementById('registerStatus').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const btn = document.getElementById('registerSubmitBtn');
    window.hideRegisterMsgs();
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const supabase = getSupabase() || await waitForSupabase();
      if (!supabase) throw new Error(authServiceMessage());
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, username: username, status: status } }
      });
      if (error) throw error;
      const user = data.user;
      if (user && !data.session) {
        window.showRegisterMsg('registerSuccess', window.currentLang === 'hu' ? 'Regisztráció sikeres! Nézd meg az email fiókodat a megerősítéshez.' : 'Registration successful! Check your email to confirm.');
      } else if (user && data.session) {
        window.currentUser = user;
        try {
          await fetch('/.netlify/functions/user-profile', {
            method: 'POST',
            headers: await window.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ fullName: name, username: username, status: status, email: email }),
          });
        } catch (profileErr) {
          console.error('Profile creation error:', profileErr);
        }
        updateAuthUI(user);
        window.closeModal('registerModal');
        const dash = document.getElementById('dashboardSection');
        if (dash) dash.scrollIntoView({ behavior: 'smooth' });
      }
      document.getElementById('registerName').value = '';
      document.getElementById('registerUsername').value = '';
      document.getElementById('registerEmail').value = '';
      document.getElementById('registerPassword').value = '';
    } catch (error) {
      window.showRegisterMsg('registerError', error.message || (window.currentLang === 'hu' ? 'A szolgáltatás nem elérhető.' : 'Service not available.'));
    } finally {
      btn.disabled = false;
      btn.textContent = window.currentLang === 'hu' ? 'Fiók létrehozása' : 'Create Account';
    }
  }

  // --- Logout ---
  window.handleLogout = async function() {
    try {
      const supabase = getSupabase() || await waitForSupabase();
      if (supabase) await supabase.auth.signOut();
    } catch (e) {}
    updateAuthUI(null);
  }

  // --- Forgot Password ---
  window.handleForgotPassword = async function() {
    const email = document.getElementById('loginEmail').value;
    if (!email) {
      window.showLoginMsg('loginError', window.currentLang === 'hu' ? 'Add meg az email címed a jelszó visszaállításhoz.' : 'Enter your email for password recovery.');
      return;
    }
    window.hideLoginMsgs();
    try {
      const supabase = getSupabase() || await waitForSupabase();
      if (!supabase) throw new Error(authServiceMessage());
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      window.showLoginMsg('loginSuccess', window.currentLang === 'hu' ? 'Jelszó-visszaállító email elküldve!' : 'Password recovery email sent!');
    } catch (error) {
      window.showLoginMsg('loginError', error.message || 'Error');
    }
  }
