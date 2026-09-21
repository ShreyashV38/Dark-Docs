/**
 * Dark Mode for Google Docs — Popup Script
 *
 * Reads and writes state to chrome.storage.local.
 * Sends messages to the active Docs tab's content script
 * for immediate application without requiring a reload.
 */

(function () {
  'use strict';

  // ── Storage Keys (must match content.js) ──────────────────────────
  const STORAGE_KEYS = {
    enabled: 'gdocs_dark_enabled',
    strategy: 'gdocs_dark_strategy',
  };

  // ── DOM Elements ──────────────────────────────────────────────────
  const toggleDark = document.getElementById('toggleDark');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const cardTargeted = document.getElementById('cardTargeted');
  const cardFilter = document.getElementById('cardFilter');
  const imageNoticeText = document.getElementById('imageNoticeText');
  const notDocs = document.getElementById('notDocs');
  const mainContent = document.getElementById('mainContent');
  const reloadBanner = document.getElementById('reloadBanner');
  const reloadBtn = document.getElementById('reloadBtn');
  const strategyRadios = document.querySelectorAll('input[name="strategy"]');

  // ── Helpers ───────────────────────────────────────────────────────

  function updateUI(state) {
    // Toggle
    toggleDark.checked = state.enabled;
    statusDot.classList.toggle('active', state.enabled);
    statusText.textContent = state.enabled ? 'Dark mode on' : 'Dark mode off';

    // Strategy
    strategyRadios.forEach((radio) => {
      radio.checked = radio.value === state.strategy;
    });
    cardTargeted.classList.toggle('selected', state.strategy === 'targeted');
    cardFilter.classList.toggle('selected', state.strategy === 'filter');

    // Image notice
    if (state.strategy === 'filter') {
      imageNoticeText.textContent =
        'Full inversion mode — all images and media will appear inverted along with the page.';
    } else {
      imageNoticeText.textContent =
        'Smart mode restores images in natural colors. If your doc is already open, reload to refresh existing images.';
    }
  }

  function getState() {
    return {
      enabled: toggleDark.checked,
      strategy: document.querySelector('input[name="strategy"]:checked')?.value || 'targeted',
    };
  }

  function persistAndNotify() {
    const state = getState();
    const data = {};
    data[STORAGE_KEYS.enabled] = state.enabled;
    data[STORAGE_KEYS.strategy] = state.strategy;

    chrome.storage.local.set(data);

    // Update UI
    updateUI(state);

    // Show reload banner to prompt refreshing already-rendered images
    if (reloadBanner) {
      reloadBanner.classList.add('visible');
    }

    // Notify active tab's content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url && tabs[0].url.includes('docs.google.com/document')) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'GDOCS_DARK_UPDATE',
          enabled: state.enabled,
          strategy: state.strategy,
        });
      }
    });
  }

  // ── Event Listeners ───────────────────────────────────────────────

  toggleDark.addEventListener('change', persistAndNotify);

  strategyRadios.forEach((radio) => {
    radio.addEventListener('change', persistAndNotify);
  });

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].id) {
          chrome.tabs.reload(tabs[0].id);
          window.close();
        }
      });
    });
  }

  // ── Initialization ────────────────────────────────────────────────

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    const isDocsTab =
      tab && tab.url && tab.url.startsWith('https://docs.google.com/document/');

    if (!isDocsTab) {
      notDocs.classList.add('visible');
      mainContent.classList.add('hidden');
      return;
    }

    // Load saved state
    chrome.storage.local.get(
      [STORAGE_KEYS.enabled, STORAGE_KEYS.strategy],
      (result) => {
        const state = {
          enabled: result[STORAGE_KEYS.enabled] || false,
          strategy: result[STORAGE_KEYS.strategy] || 'targeted',
        };

        updateUI(state);

        // Query content script for additional info
        chrome.tabs.sendMessage(
          tab.id,
          { type: 'GDOCS_DARK_GET_STATE' },
          (response) => {
            if (chrome.runtime.lastError) return;
            if (response) {
              updateUI({ ...state, ...response });
            }
          }
        );
      }
    );
  });
})();
