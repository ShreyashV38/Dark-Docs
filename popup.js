/**
 * DarkSpace — Unified Popup Controller
 *
 * Provides a clean 3-control interface:
 *   1. Master Switch (Global DarkSpace On/Off)
 *   2. Per-App Switch (Enable/Disable for currently active Google service)
 *   3. Appearance Mode (Full Dark vs UI Only for Docs/Sheets/Slides/Drawings)
 *
 * Broadcasts updates via chrome.storage.local and active tab messaging.
 */

(function () {
  'use strict';

  const STORAGE_KEYS = {
    masterEnabled: 'darkspace_master_enabled',
    appEnabled: 'darkspace_app_enabled',
    mode: 'darkspace_mode',
    legacyEnabled: 'gdocs_dark_enabled',
  };

  const APP_NAMES = {
    docs: 'Google Docs',
    sheets: 'Google Sheets',
    slides: 'Google Slides',
    forms: 'Google Forms',
    drawings: 'Google Drawings',
    classroom: 'Google Classroom',
    scholar: 'Google Scholar',
    translate: 'Google Translate',
    contacts: 'Google Contacts',
  };

  // ── DOM Elements ──────────────────────────────────────────────────
  const appBadge = document.getElementById('appBadge');
  const masterToggle = document.getElementById('masterToggle');
  const appRow = document.getElementById('appRow');
  const appToggle = document.getElementById('appToggle');
  const appToggleTitle = document.getElementById('appToggleTitle');
  const appToggleDesc = document.getElementById('appToggleDesc');
  const modeSection = document.getElementById('modeSection');
  const btnModeFull = document.getElementById('btnModeFull');
  const btnModeUiOnly = document.getElementById('btnModeUiOnly');
  const inactiveCard = document.getElementById('inactiveCard');
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');

  let activeTabId = null;
  let detectedApp = null;
  let localState = {
    masterEnabled: true,
    appEnabled: {},
    mode: 'full',
  };

  // ── App Detection Helper ──────────────────────────────────────────
  function detectAppFromUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      const path = parsed.pathname;

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
    } catch (e) {
      return null;
    }
    return null;
  }

  // ── UI Render ─────────────────────────────────────────────────────
  function updateUI() {
    masterToggle.checked = localState.masterEnabled;

    if (detectedApp) {
      const appName = APP_NAMES[detectedApp] || 'This Google App';
      appBadge.textContent = appName;
      appBadge.classList.add('active-app');
      appToggleTitle.textContent = `Enable for ${appName}`;
      appToggleDesc.textContent = `Dark theme for ${appName}`;

      const isCurrentAppEnabled = localState.appEnabled[detectedApp] !== false;
      appToggle.checked = isCurrentAppEnabled;
      appToggle.disabled = !localState.masterEnabled;
      appRow.style.opacity = localState.masterEnabled ? '1' : '0.5';

      // Mode section only applies to canvas/editor apps
      const hasCanvasMode = ['docs', 'sheets', 'slides', 'drawings'].includes(detectedApp);
      modeSection.style.display = hasCanvasMode ? 'flex' : 'none';

      btnModeFull.classList.toggle('active', localState.mode === 'full');
      btnModeUiOnly.classList.toggle('active', localState.mode === 'ui-only');

      inactiveCard.classList.remove('visible');

      const isEffectiveDark = localState.masterEnabled && isCurrentAppEnabled;
      statusDot.classList.toggle('active', isEffectiveDark);
      statusLabel.textContent = isEffectiveDark ? `${appName} Dark` : 'DarkSpace Off';
    } else {
      appBadge.textContent = 'Not a Google App';
      appBadge.classList.remove('active-app');
      appRow.style.display = 'none';
      modeSection.style.display = 'none';
      inactiveCard.classList.add('visible');

      statusDot.classList.toggle('active', localState.masterEnabled);
      statusLabel.textContent = localState.masterEnabled ? 'DarkSpace Ready' : 'DarkSpace Off';
    }
  }

  // ── Sync & Notify ─────────────────────────────────────────────────
  function persistAndBroadcast() {
    const data = {
      [STORAGE_KEYS.masterEnabled]: localState.masterEnabled,
      [STORAGE_KEYS.appEnabled]: localState.appEnabled,
      [STORAGE_KEYS.mode]: localState.mode,
      [STORAGE_KEYS.legacyEnabled]: localState.masterEnabled,
    };

    chrome.storage.local.set(data);
    updateUI();

    if (activeTabId && detectedApp) {
      chrome.tabs.sendMessage(activeTabId, {
        type: 'DARKSPACE_UPDATE_STATE',
        masterEnabled: localState.masterEnabled,
        app: detectedApp,
        appEnabled: localState.appEnabled[detectedApp] !== false,
        mode: localState.mode,
      });

      // Backward compatibility message for Docs
      if (detectedApp === 'docs') {
        chrome.tabs.sendMessage(activeTabId, {
          type: 'GDOCS_DARK_UPDATE',
          enabled: localState.masterEnabled && localState.appEnabled['docs'] !== false,
          strategy: localState.mode === 'ui-only' ? 'ui-only' : 'targeted',
        });
      }
    }
  }

  // ── Event Handlers ────────────────────────────────────────────────
  masterToggle.addEventListener('change', () => {
    localState.masterEnabled = masterToggle.checked;
    persistAndBroadcast();
  });

  appToggle.addEventListener('change', () => {
    if (detectedApp) {
      localState.appEnabled[detectedApp] = appToggle.checked;
      persistAndBroadcast();
    }
  });

  btnModeFull.addEventListener('click', () => {
    localState.mode = 'full';
    persistAndBroadcast();
  });

  btnModeUiOnly.addEventListener('click', () => {
    localState.mode = 'ui-only';
    persistAndBroadcast();
  });

  // ── Initialization ────────────────────────────────────────────────
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab) {
      activeTabId = tab.id;
      detectedApp = detectAppFromUrl(tab.url);
    }

    chrome.storage.local.get(
      [
        STORAGE_KEYS.masterEnabled,
        STORAGE_KEYS.appEnabled,
        STORAGE_KEYS.mode,
        STORAGE_KEYS.legacyEnabled,
      ],
      (result) => {
        if (result[STORAGE_KEYS.masterEnabled] !== undefined) {
          localState.masterEnabled = result[STORAGE_KEYS.masterEnabled];
        } else if (result[STORAGE_KEYS.legacyEnabled] !== undefined) {
          localState.masterEnabled = result[STORAGE_KEYS.legacyEnabled];
        } else {
          localState.masterEnabled = true;
        }

        localState.appEnabled = result[STORAGE_KEYS.appEnabled] || {};
        localState.mode = result[STORAGE_KEYS.mode] || 'full';

        updateUI();

        // Query active tab content script for live state if tab exists
        if (activeTabId && detectedApp) {
          chrome.tabs.sendMessage(
            activeTabId,
            { type: 'DARKSPACE_GET_STATE' },
            (response) => {
              if (chrome.runtime.lastError || !response) return;
              if (response.masterEnabled !== undefined) {
                localState.masterEnabled = response.masterEnabled;
              }
              if (response.mode) {
                localState.mode = response.mode;
              }
              if (response.app && response.appEnabled !== undefined) {
                localState.appEnabled[response.app] = response.appEnabled;
              }
              updateUI();
            }
          );
        }
      }
    );
  });
})();
