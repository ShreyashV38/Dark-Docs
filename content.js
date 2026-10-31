/**
 * DarkSpace — Unified Multi-App Content Script
 *
 * Supports:
 *   Google Docs, Google Sheets, Google Classroom, Google Slides,
 *   Google Forms, Google Drawings, Google Scholar, Google Translate,
 *   and Google Contacts.
 *
 * Responsibilities:
 *   1. Detect active Google application route.
 *   2. Synchronize configuration from chrome.storage.local.
 *   3. Set root dataset attributes on documentElement (data-darkspace-enabled,
 *      data-darkspace-app, data-darkspace-mode).
 *   4. Handle SPA navigation across Google Workspace view changes.
 *   5. Listen for live updates from popup without requiring page reload.
 */

(function () {
  'use strict';

  // ── Storage Keys ────────────────────────────────────────────────────
  const STORAGE_KEYS = {
    masterEnabled: 'darkspace_master_enabled',
    appEnabled: 'darkspace_app_enabled',
    mode: 'darkspace_mode', // 'full' | 'ui-only'
    // Legacy keys
    legacyEnabled: 'gdocs_dark_enabled',
    legacyStrategy: 'gdocs_dark_strategy',
  };

  const DEFAULT_APP_STATES = {
    docs: true,
    sheets: true,
    slides: true,
    forms: true,
    drawings: true,
    classroom: true,
    scholar: true,
    translate: true,
    contacts: true,
  };

  let currentState = {
    masterEnabled: true,
    appEnabled: { ...DEFAULT_APP_STATES },
    mode: 'full',
  };

  // ── Route & App Detection ───────────────────────────────────────────
  function detectApp() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    if (host.includes('docs.google.com')) {
      if (path.includes('/document/')) return 'docs';
      if (path.includes('/spreadsheets/')) return 'sheets';
      if (path.includes('/presentation/')) return 'slides';
      if (path.includes('/forms/')) return 'forms';
      if (path.includes('/drawings/')) return 'drawings';
      return 'docs';
    }
    if (host.includes('classroom.google.com')) return 'classroom';
    if (host.includes('scholar.google.com')) return 'scholar';
    if (host.includes('translate.google.com')) return 'translate';
    if (host.includes('contacts.google.com')) return 'contacts';
    return null;
  }

  function isAppDark(app) {
    if (!currentState.masterEnabled) return false;
    if (!app) return false;
    return currentState.appEnabled[app] !== false;
  }

  // ── Canvas Hook Inserter (Fallback for Docs/Sheets) ──────────────────
  function ensureCanvasHook() {
    if (document.getElementById('darkspace-canvas-hook')) return;
    if (!window.location.hostname.includes('docs.google.com')) return;

    try {
      const script = document.createElement('script');
      script.id = 'darkspace-canvas-hook';
      script.src = chrome.runtime.getURL('canvas-hook.js');
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      // Script already injected via manifest content_scripts world: MAIN
    }
  }

  function notifyRefresh() {
    window.dispatchEvent(new CustomEvent('darkspace-refresh'));
    window.dispatchEvent(new CustomEvent('gdocs-dark-refresh-tiles'));
  }

  // ── Apply / Remove Dark Mode ─────────────────────────────────────────
  function applyTheme() {
    const root = document.documentElement;
    if (!root) return;

    const app = detectApp();
    const enabled = isAppDark(app);
    const mode = currentState.mode || 'full';

    root.setAttribute('data-darkspace-enabled', enabled ? 'true' : 'false');
    if (app) {
      root.setAttribute('data-darkspace-app', app);
    }
    root.setAttribute('data-darkspace-mode', mode);

    // Support legacy classes for Google Docs targeted inversion
    if (app === 'docs') {
      root.classList.remove('gdocs-dark-targeted', 'gdocs-dark-filter');
      if (enabled && mode === 'full') {
        root.classList.add('gdocs-dark-targeted');
      }
    } else {
      root.classList.remove('gdocs-dark-targeted', 'gdocs-dark-filter');
    }

    notifyRefresh();
    fixBackdrops(enabled);
  }

  // ── Modal & Popup Backdrop Darkening ─────────────────────────────────
  function fixBackdrops(enabled) {
    if (!document.body) return;

    if (!enabled) {
      document.querySelectorAll('[data-darkspace-backdrop]').forEach((el) => {
        el.style.removeProperty('filter');
        el.removeAttribute('data-darkspace-backdrop');
      });
      return;
    }

    const candidates = document.querySelectorAll(
      '.modal-dialog-bg, .goog-modal-dialog-bg, .docs-dialog-bg, .apps-dialog-bg, ' +
      '.docs-material-dialog-bg, .picker-dialog-bg, .mdc-dialog__scrim, ' +
      '[class*="dialog-bg"], [class*="modal-dialog-bg"], [class*="modal-backdrop"], ' +
      '[class*="dialog-backdrop"], [class*="scrim"]'
    );
    candidates.forEach((el) => {
      el.style.setProperty('filter', 'invert(1) hue-rotate(180deg)', 'important');
      el.setAttribute('data-darkspace-backdrop', 'true');
    });
  }

  // ── Storage Read/Write ───────────────────────────────────────────────
  function loadState(callback) {
    chrome.storage.local.get(
      [
        STORAGE_KEYS.masterEnabled,
        STORAGE_KEYS.appEnabled,
        STORAGE_KEYS.mode,
        STORAGE_KEYS.legacyEnabled,
        STORAGE_KEYS.legacyStrategy,
      ],
      (result) => {
        // Master switch (default: true)
        if (result[STORAGE_KEYS.masterEnabled] !== undefined) {
          currentState.masterEnabled = result[STORAGE_KEYS.masterEnabled];
        } else if (result[STORAGE_KEYS.legacyEnabled] !== undefined) {
          currentState.masterEnabled = result[STORAGE_KEYS.legacyEnabled];
        } else {
          currentState.masterEnabled = true;
        }

        // Per-app map
        currentState.appEnabled = {
          ...DEFAULT_APP_STATES,
          ...(result[STORAGE_KEYS.appEnabled] || {}),
        };

        // Appearance mode
        if (result[STORAGE_KEYS.mode]) {
          currentState.mode = result[STORAGE_KEYS.mode];
        } else {
          currentState.mode = 'full';
        }

        if (callback) callback();
      }
    );
  }

  // ── Observers ────────────────────────────────────────────────────────
  let observer = null;
  let bodyObserver = null;

  function startObserver() {
    if (observer) observer.disconnect();
    if (bodyObserver) bodyObserver.disconnect();

    const app = detectApp();
    const enabled = isAppDark(app);

    const root = document.documentElement;
    observer = new MutationObserver(() => {
      const currentAttr = root.getAttribute('data-darkspace-enabled');
      const expectedAttr = isAppDark(detectApp()) ? 'true' : 'false';
      if (currentAttr !== expectedAttr) {
        applyTheme();
      }
    });

    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-darkspace-enabled', 'class'],
    });

    if (document.body) {
      bodyObserver = new MutationObserver(() => {
        const app = detectApp();
        if (isAppDark(app)) {
          fixBackdrops(true);
        }
      });

      bodyObserver.observe(document.body, {
        childList: true,
      });

      fixBackdrops(enabled);
    }
  }

  // ── SPA Navigation Watcher ───────────────────────────────────────────
  let lastUrl = location.href;
  function onUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      loadState(() => {
        applyTheme();
        startObserver();
      });
    }
  }

  function watchNavigation() {
    window.addEventListener('popstate', onUrlChange);
    window.addEventListener('hashchange', onUrlChange);

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(this, args);
      onUrlChange();
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      onUrlChange();
    };
  }

  // ── Message Listener (from popup) ────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const app = detectApp();

    if (message.type === 'DARKSPACE_UPDATE_STATE') {
      if (message.masterEnabled !== undefined) {
        currentState.masterEnabled = message.masterEnabled;
      }
      if (message.app && message.appEnabled !== undefined) {
        currentState.appEnabled[message.app] = message.appEnabled;
      }
      if (message.mode) {
        currentState.mode = message.mode;
      }

      applyTheme();
      sendResponse({ success: true, app, enabled: isAppDark(app) });
      return true;
    }

    if (message.type === 'DARKSPACE_GET_STATE') {
      sendResponse({
        masterEnabled: currentState.masterEnabled,
        appEnabled: app ? currentState.appEnabled[app] !== false : true,
        mode: currentState.mode,
        app: app,
        supported: app !== null,
      });
      return true;
    }

    // Backward compatibility with legacy messages
    if (message.type === 'GDOCS_DARK_UPDATE') {
      currentState.masterEnabled = message.enabled;
      if (message.strategy === 'filter') {
        currentState.mode = 'full';
      }
      applyTheme();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'GDOCS_DARK_GET_STATE') {
      sendResponse({
        enabled: isAppDark('docs'),
        strategy: 'targeted',
        isCanvas: document.querySelector('.kix-canvas-tile-content') !== null,
      });
      return true;
    }

    return true;
  });

  // ── Storage Change Listener (multi-tab sync) ─────────────────────────
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    let needsUpdate = false;
    if (changes[STORAGE_KEYS.masterEnabled]) {
      currentState.masterEnabled = changes[STORAGE_KEYS.masterEnabled].newValue;
      needsUpdate = true;
    }
    if (changes[STORAGE_KEYS.appEnabled]) {
      currentState.appEnabled = {
        ...currentState.appEnabled,
        ...(changes[STORAGE_KEYS.appEnabled].newValue || {}),
      };
      needsUpdate = true;
    }
    if (changes[STORAGE_KEYS.mode]) {
      currentState.mode = changes[STORAGE_KEYS.mode].newValue;
      needsUpdate = true;
    }

    if (needsUpdate) {
      applyTheme();
    }
  });

  // ── Initialization ───────────────────────────────────────────────────
  function init() {
    ensureCanvasHook();

    loadState(() => {
      applyTheme();
      startObserver();
    });

    watchNavigation();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        loadState(() => {
          applyTheme();
          startObserver();
        });
      });
    }
  }

  init();
})();
