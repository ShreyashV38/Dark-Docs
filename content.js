/**
 * Dark Mode for Google Docs — Content Script
 *
 * Responsibilities:
 *   1. Read persisted state from chrome.storage.local
 *   2. Apply/remove the correct class on <html> (documentElement)
 *   3. Observe DOM mutations (Docs re-renders on scroll/edit)
 *   4. Handle SPA navigation (URL changes without full reload)
 *   5. Listen for messages from popup to toggle state in real-time
 *
 * The filter is applied at the <html> level so the ENTIRE
 * Google Docs window goes dark — not just the editor canvas.
 */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────
  const STORAGE_KEYS = {
    enabled: 'gdocs_dark_enabled',
    strategy: 'gdocs_dark_strategy', // 'filter' | 'targeted'
  };

  const CLASSES = {
    filter: 'gdocs-dark-filter',
    targeted: 'gdocs-dark-targeted',
  };

  let currentState = {
    enabled: false,
    strategy: 'targeted',
  };

  // ── Rendering Detection ──────────────────────────────────────────
  /**
   * Detect whether Google Docs is using canvas-based rendering.
   * Newer versions render text onto <canvas> tiles instead of DOM spans.
   */
  function isCanvasRendering() {
    return document.querySelector('.kix-canvas-tile-content') !== null;
  }

  // ── Canvas Hook Inserter (Fallback) ──────────────────────────────
  function ensureCanvasHook() {
    if (document.getElementById('gdocs-dark-canvas-hook')) return;
    try {
      const script = document.createElement('script');
      script.id = 'gdocs-dark-canvas-hook';
      script.src = chrome.runtime.getURL('canvas-hook.js');
      (document.head || document.documentElement).appendChild(script);
    } catch (e) {
      // Handled if already injected via manifest content_scripts world: MAIN
    }
  }

  function notifyTileRefresh() {
    window.dispatchEvent(new CustomEvent('gdocs-dark-refresh-tiles'));
  }

  // ── Apply / Remove Dark Mode ─────────────────────────────────────
  // Classes go on <html> (documentElement) so the filter applies
  // to the ENTIRE page, including all chrome/toolbars.

  function applyDarkMode() {
    const root = document.documentElement;
    if (!root) return;

    // Remove both strategy classes first
    root.classList.remove(CLASSES.filter, CLASSES.targeted);

    if (!currentState.enabled) return;

    if (currentState.strategy === 'filter') {
      root.classList.add(CLASSES.filter);
    } else {
      root.classList.add(CLASSES.targeted);
    }

    notifyTileRefresh();
    fixBackdrops();
  }

  function removeDarkMode() {
    const root = document.documentElement;
    if (!root) return;
    root.classList.remove(CLASSES.filter, CLASSES.targeted);
    notifyTileRefresh();
    fixBackdrops();
  }

  // ── Storage Read/Write ───────────────────────────────────────────
  function loadState(callback) {
    chrome.storage.local.get(
      [STORAGE_KEYS.enabled, STORAGE_KEYS.strategy],
      (result) => {
        currentState.enabled =
          result[STORAGE_KEYS.enabled] !== undefined
            ? result[STORAGE_KEYS.enabled]
            : false;
        currentState.strategy =
          result[STORAGE_KEYS.strategy] || 'targeted';

        if (callback) callback();
      }
    );
  }

  // ── Modal & Popup Backdrop Darkening ────────────────────────────
  function fixBackdrops() {
    if (!document.body) return;

    if (!currentState.enabled) {
      document.querySelectorAll('[data-gdocs-dark-backdrop]').forEach((el) => {
        el.style.removeProperty('filter');
        el.removeAttribute('data-gdocs-dark-backdrop');
      });
      return;
    }

    // 1. Selector-based search
    const candidates = document.querySelectorAll(
      '.modal-dialog-bg, .goog-modal-dialog-bg, .docs-dialog-bg, .apps-dialog-bg, ' +
      '.docs-material-dialog-bg, .picker-dialog-bg, .mdc-dialog__scrim, ' +
      '[class*="dialog-bg"], [class*="modal-dialog-bg"], [class*="modal-backdrop"], ' +
      '[class*="dialog-backdrop"], [class*="scrim"]'
    );
    candidates.forEach((el) => {
      el.style.setProperty('filter', 'invert(1) hue-rotate(180deg)', 'important');
      el.setAttribute('data-gdocs-dark-backdrop', 'true');
    });

    // 2. Full-screen overlay detector on body children
    const children = document.body.children;
    const minW = window.innerWidth * 0.7;
    const minH = window.innerHeight * 0.7;

    for (let i = 0; i < children.length; i++) {
      const el = children[i];
      if (el.tagName !== 'DIV') continue;
      if (el.id === 'docs-editor' || el.classList.contains('kix-appview-editor') || el.classList.contains('docs-ui-unprintable')) continue;
      // Skip the dialog window itself
      if (el.getAttribute('role') === 'dialog' || el.querySelector('[role="dialog"]') || el.querySelector('.modal-dialog-content')) continue;

      const style = window.getComputedStyle(el);
      const isPositioned = style.position === 'fixed' || style.position === 'absolute';
      const isFullScreen = el.offsetWidth >= minW && el.offsetHeight >= minH;
      const isEmpty = !el.innerText || !el.innerText.trim();

      if (isPositioned && isFullScreen && isEmpty) {
        el.style.setProperty('filter', 'invert(1) hue-rotate(180deg)', 'important');
        el.setAttribute('data-gdocs-dark-backdrop', 'true');
      }
    }
  }

  // ── MutationObserver ─────────────────────────────────────────────
  let observer = null;
  let bodyObserver = null;

  function startObserver() {
    if (observer) observer.disconnect();
    if (bodyObserver) bodyObserver.disconnect();

    // Observe editor container for theme stripping
    const editorTarget = document.querySelector('.kix-appview-editor') || document.body;
    observer = new MutationObserver(() => {
      if (currentState.enabled) {
        const root = document.documentElement;
        const expectedClass =
          currentState.strategy === 'filter' ? CLASSES.filter : CLASSES.targeted;

        if (!root.classList.contains(expectedClass)) {
          applyDarkMode();
        }
      }
    });

    observer.observe(editorTarget, {
      childList: true,
      subtree: true,
    });

    // Observe document.body specifically for modal popups and dialog backdrops
    if (document.body) {
      bodyObserver = new MutationObserver(() => {
        fixBackdrops();
      });

      bodyObserver.observe(document.body, {
        childList: true,
      });

      fixBackdrops();
    }
  }

  // ── SPA Navigation Handler ───────────────────────────────────────
  // Google Docs is a single-page app. When switching documents via
  // links or browser back/forward, the URL changes without reload.

  let lastUrl = location.href;

  function onUrlChange() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      loadState(() => {
        if (currentState.enabled) {
          applyDarkMode();
        } else {
          removeDarkMode();
        }
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

  // ── Message Listener (from popup) ────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GDOCS_DARK_UPDATE') {
      currentState.enabled = message.enabled;
      currentState.strategy = message.strategy;

      if (currentState.enabled) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }

      sendResponse({ success: true });
    }

    if (message.type === 'GDOCS_DARK_GET_STATE') {
      sendResponse({
        enabled: currentState.enabled,
        strategy: currentState.strategy,
        isCanvas: isCanvasRendering(),
      });
    }

    return true;
  });

  // ── Storage Change Listener ──────────────────────────────────────
  // Sync state across multiple open Docs tabs
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    let needsUpdate = false;

    if (changes[STORAGE_KEYS.enabled]) {
      currentState.enabled = changes[STORAGE_KEYS.enabled].newValue;
      needsUpdate = true;
    }
    if (changes[STORAGE_KEYS.strategy]) {
      currentState.strategy = changes[STORAGE_KEYS.strategy].newValue;
      needsUpdate = true;
    }

    if (needsUpdate) {
      if (currentState.enabled) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }
    }
  });

  // ── Initialization ───────────────────────────────────────────────
  function init() {
    ensureCanvasHook();

    loadState(() => {
      if (currentState.enabled) {
        applyDarkMode();
      }
      startObserver();
    });

    watchNavigation();

    // Re-apply when DOM is fully ready (Docs can be slow to load)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        loadState(() => {
          if (currentState.enabled) applyDarkMode();
          startObserver();
        });
      });
    }
  }

  init();
})();
