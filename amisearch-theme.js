(function () {
  'use strict';

  const themes = {
    purple: { label: 'Lila', primary: '#6C5CE7', hover: '#5A4BD1', light: '#EFEEFF', ring: '#A29BFE' },
    blue: { label: 'Kék', primary: '#2563EB', hover: '#1D4ED8', light: '#DBEAFE', ring: '#93C5FD' },
    emerald: { label: 'Zöld', primary: '#059669', hover: '#047857', light: '#D1FAE5', ring: '#6EE7B7' },
    orange: { label: 'Narancs', primary: '#D97706', hover: '#B45309', light: '#FEF3C7', ring: '#FCD34D' }
  };

  function setTheme(themeName) {
    const theme = themes[themeName] || themes.purple;
    let style = document.getElementById('amisearch-dynamic-theme');
    if (!style) {
      style = document.createElement('style');
      style.id = 'amisearch-dynamic-theme';
      document.head.appendChild(style);
    }

    style.textContent = `
      :root {
        --amisearch-primary: ${theme.primary};
        --amisearch-primary-hover: ${theme.hover};
        --amisearch-primary-light: ${theme.light};
      }
      .btn-primary,
      .bg-\[\#6C5CE7\],
      .bg-purple-600,
      .bg-indigo-600,
      button[type="submit"] {
        background: ${theme.primary} !important;
        background-color: ${theme.primary} !important;
      }
      .btn-primary:hover,
      .bg-purple-600:hover,
      .bg-indigo-600:hover,
      button[type="submit"]:hover {
        background: ${theme.hover} !important;
        background-color: ${theme.hover} !important;
      }
      .text-\[\#6C5CE7\],
      .text-purple-600,
      .text-indigo-600 {
        color: ${theme.primary} !important;
      }
      .border-\[\#6C5CE7\],
      .border-purple-600,
      .border-indigo-600 {
        border-color: ${theme.primary} !important;
      }
      .bg-purple-50,
      .bg-indigo-50 {
        background-color: ${theme.light} !important;
      }
      #amisearch-picker button[data-active="true"] {
        outline: 3px solid ${theme.ring};
        outline-offset: 2px;
      }
    `;

    try { localStorage.setItem('amisearch-theme', themeName); } catch (_) {}
    document.querySelectorAll('#amisearch-picker button').forEach((button) => {
      button.dataset.active = button.dataset.theme === themeName ? 'true' : 'false';
    });
  }

  function createPicker() {
    if (document.getElementById('amisearch-picker')) return;

    const picker = document.createElement('section');
    picker.id = 'amisearch-picker';
    picker.setAttribute('aria-label', 'AMISEARCH színválasztó');
    picker.style.cssText = [
      'position:fixed',
      'left:16px',
      'bottom:16px',
      'z-index:10000',
      'display:flex',
      'gap:10px',
      'align-items:center',
      'background:#ffffff',
      'padding:10px 12px',
      'border:2px solid #6C5CE7',
      'border-radius:999px',
      'box-shadow:0 8px 24px rgba(45,52,54,.18)'
    ].join(';');

    Object.entries(themes).forEach(([name, theme]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.theme = name;
      button.setAttribute('aria-label', 'Téma kiválasztása: ' + theme.label);
      button.title = theme.label;
      button.style.cssText = [
        'width:28px',
        'height:28px',
        'border-radius:999px',
        'border:2px solid #ffffff',
        'background:' + theme.primary,
        'cursor:pointer',
        'box-shadow:0 1px 4px rgba(0,0,0,.25)'
      ].join(';');
      button.addEventListener('click', () => setTheme(name));
      picker.appendChild(button);
    });

    document.body.appendChild(picker);
    let saved = 'purple';
    try { saved = localStorage.getItem('amisearch-theme') || 'purple'; } catch (_) {}
    setTheme(themes[saved] ? saved : 'purple');
  }

  window.changeSiteTheme = setTheme;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPicker, { once: true });
  } else {
    createPicker();
  }
})();
