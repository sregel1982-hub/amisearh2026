(function () {
  'use strict';

  const STORAGE_KEY = 'amisearch_pastel_theme';

  const themes = {
    lavender: {
      label: 'Levendula',
      primary: '#8B7CF6',
      primaryDark: '#6D5EEA',
      soft: '#F3F0FF',
      softer: '#FAF8FF',
      border: '#DDD6FE'
    },
    sky: {
      label: 'Égkék',
      primary: '#60A5FA',
      primaryDark: '#3B82F6',
      soft: '#EFF6FF',
      softer: '#F8FBFF',
      border: '#BFDBFE'
    },
    mint: {
      label: 'Menta',
      primary: '#34D399',
      primaryDark: '#10B981',
      soft: '#ECFDF5',
      softer: '#F7FFFB',
      border: '#BBF7D0'
    },
    peach: {
      label: 'Barack',
      primary: '#FDBA74',
      primaryDark: '#FB923C',
      soft: '#FFF7ED',
      softer: '#FFFCF8',
      border: '#FED7AA'
    },
    rose: {
      label: 'Rózsa',
      primary: '#FDA4AF',
      primaryDark: '#F43F5E',
      soft: '#FFF1F2',
      softer: '#FFFAFA',
      border: '#FFE4E6'
    }
  };

  function applyTheme(name) {
    const theme = themes[name] || themes.lavender;
    const root = document.documentElement;

    root.style.setProperty('--ami-primary', theme.primary);
    root.style.setProperty('--ami-primary-dark', theme.primaryDark);
    root.style.setProperty('--ami-soft', theme.soft);
    root.style.setProperty('--ami-softer', theme.softer);
    root.style.setProperty('--ami-border', theme.border);

    localStorage.setItem(STORAGE_KEY, name);

    document.querySelectorAll('[data-ami-theme-dot]').forEach((el) => {
      el.style.outline = el.dataset.themeName === name ? '3px solid rgba(17, 24, 39, 0.22)' : 'none';
      el.style.transform = el.dataset.themeName === name ? 'scale(1.08)' : 'scale(1)';
    });
  }

  function injectCss() {
    if (document.getElementById('amisearch-pastel-theme-style')) return;

    const style = document.createElement('style');
    style.id = 'amisearch-pastel-theme-style';
    style.textContent = `
      :root {
        --ami-primary: #8B7CF6;
        --ami-primary-dark: #6D5EEA;
        --ami-soft: #F3F0FF;
        --ami-softer: #FAF8FF;
        --ami-border: #DDD6FE;
      }

      .bg-\[\#6C5CE7\],
      .hover\:bg-\[\#5A4BD1\]:hover {
        background-color: var(--ami-primary) !important;
      }

      .text-\[\#6C5CE7\] {
        color: var(--ami-primary-dark) !important;
      }

      .border-indigo-100,
      .border-purple-100 {
        border-color: var(--ami-border) !important;
      }

      .bg-indigo-50,
      .bg-purple-50 {
        background-color: var(--ami-soft) !important;
      }

      .from-\[\#6C5CE7\],
      .to-\[\#A29BFE\] {
        --tw-gradient-from: var(--ami-primary) !important;
        --tw-gradient-to: var(--ami-primary-dark) !important;
      }

      #amisearch-theme-picker {
        position: fixed;
        right: 14px;
        bottom: 82px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 9px 10px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.88);
        backdrop-filter: blur(10px);
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      }

      #amisearch-theme-picker button {
        width: 24px;
        height: 24px;
        border: 2px solid rgba(255, 255, 255, 0.95);
        border-radius: 999px;
        cursor: pointer;
        transition: transform 0.15s ease, outline 0.15s ease;
      }

      #amisearch-theme-picker button:hover {
        transform: scale(1.12);
      }

      @media (max-width: 640px) {
        #amisearch-theme-picker {
          right: 10px;
          bottom: 68px;
          padding: 8px;
          gap: 6px;
        }

        #amisearch-theme-picker button {
          width: 22px;
          height: 22px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createPicker() {
    if (document.getElementById('amisearch-theme-picker')) return;

    const picker = document.createElement('div');
    picker.id = 'amisearch-theme-picker';
    picker.setAttribute('aria-label', 'AMISEARCH halvány színválasztó');

    Object.entries(themes).forEach(([name, theme]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = theme.label;
      btn.setAttribute('aria-label', theme.label + ' téma');
      btn.dataset.amiThemeDot = '1';
      btn.dataset.themeName = name;
      btn.style.background = `linear-gradient(135deg, ${theme.soft}, ${theme.primary})`;
      btn.addEventListener('click', () => applyTheme(name));
      picker.appendChild(btn);
    });

    document.body.appendChild(picker);
  }

  function init() {
    injectCss();
    createPicker();
    applyTheme(localStorage.getItem(STORAGE_KEY) || 'lavender');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
