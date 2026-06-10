// Safe compatibility loader for older AMISEARCH pages.
// The real accessible theme picker is served from /amisearch-theme.js.
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (document.querySelector('script[data-amisearch-theme-loader="true"]')) return;
  var script = document.createElement('script');
  script.src = '/amisearch-theme.js';
  script.defer = true;
  script.dataset.amisearchThemeLoader = 'true';
  document.head.appendChild(script);
})();
