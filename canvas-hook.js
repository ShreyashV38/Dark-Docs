/**
 * DarkSpace — Route-Aware Canvas Interception Hook
 *
 * Runs in the MAIN world execution context at document_start.
 * Intercepts CanvasRenderingContext2D drawing methods to adapt intelligently
 * across Google Workspace applications:
 *
 * 1. Google Docs (/document/):
 *    - Pre-inverts user media drawn to .kix-canvas-tile-content when Full Dark mode is active,
 *      so that the page inversion restores original natural colors.
 *
 * 2. Google Sheets (/spreadsheets/):
 *    - Intercepts spreadsheet grid canvas rendering in Full Dark mode:
 *      - Remaps default white cell backgrounds to dark surface (#1e1f22).
 *      - Remaps default light gridlines to subtle dark gridlines (#333639).
 *      - Remaps default black cell text to crisp light text (#e8eaed).
 *      - Remaps header cell backgrounds (#f8f9fa, #f1f3f4) to elevated surface (#282a2e).
 *    - Color Preservation Guardrail: leaves user cell fills, conditional formatting,
 *      chart canvases, and embedded images completely unaltered.
 *
 * 3. Google Slides (/presentation/) & Google Drawings (/drawings/):
 *    - Canvas drawing is untouched by default to guarantee 100% color/media accuracy.
 */

(function () {
  'use strict';

  if (window.__darkspace_canvas_hook_installed__) return;
  window.__darkspace_canvas_hook_installed__ = true;

  const INVERT_FILTER = 'invert(1) hue-rotate(180deg)';

  let isDarkEnabled = false;
  let currentApp = 'docs';
  let currentMode = 'full'; // 'full' | 'ui-only'

  // Route detection fallback in MAIN world
  function detectAppFromRoute() {
    const host = window.location.hostname;
    const path = window.location.pathname;

    if (host.includes('docs.google.com')) {
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
    return 'docs';
  }

  // Fast check synced with documentElement attributes & classes
  function updateState() {
    const root = document.documentElement;
    if (!root) return;

    const enabledAttr = root.getAttribute('data-darkspace-enabled');
    const appAttr = root.getAttribute('data-darkspace-app');
    const modeAttr = root.getAttribute('data-darkspace-mode');

    // Also support legacy Dark-Docs classes for backward compatibility
    const hasLegacyClass =
      root.classList.contains('gdocs-dark-targeted') ||
      root.classList.contains('gdocs-dark-filter');

    isDarkEnabled = enabledAttr === 'true' || (enabledAttr === null && hasLegacyClass);
    currentApp = appAttr || detectAppFromRoute();
    currentMode = modeAttr || 'full';
  }

  // Observe attribute & class changes on <html>
  const observer = new MutationObserver(updateState);
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [
        'data-darkspace-enabled',
        'data-darkspace-app',
        'data-darkspace-mode',
        'class',
      ],
    });
    updateState();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [
          'data-darkspace-enabled',
          'data-darkspace-app',
          'data-darkspace-mode',
          'class',
        ],
      });
      updateState();
    });
  }

  function requestRepaint() {
    window.dispatchEvent(new Event('resize'));
  }

  // Listen for explicit redraw requests from content script
  window.addEventListener('darkspace-refresh', () => {
    updateState();
    requestRepaint();
  });
  window.addEventListener('gdocs-dark-refresh-tiles', () => {
    updateState();
    requestRepaint();
  });

  // ── Color Identification Helpers ────────────────────────────────────

  function isWhiteOrLightSurface(color) {
    if (typeof color !== 'string') return false;
    const c = color.trim().toLowerCase();
    return (
      c === '#ffffff' ||
      c === '#fff' ||
      c === 'white' ||
      c === 'rgb(255, 255, 255)' ||
      c === 'rgba(255, 255, 255, 1)' ||
      c === 'rgba(255, 255, 255, 1.0)' ||
      c === '#fafafa' ||
      c === '#fcfcfc'
    );
  }

  function isHeaderSurface(color) {
    if (typeof color !== 'string') return false;
    const c = color.trim().toLowerCase();
    return (
      c === '#f8f9fa' ||
      c === '#f1f3f4' ||
      c === '#f3f3f3' ||
      c === '#f5f5f5' ||
      c === 'rgb(248, 249, 250)' ||
      c === 'rgb(241, 243, 244)'
    );
  }

  function isBlackOrDarkText(color) {
    if (typeof color !== 'string') return false;
    const c = color.trim().toLowerCase();
    return (
      c === '#000000' ||
      c === '#000' ||
      c === 'black' ||
      c === 'rgb(0, 0, 0)' ||
      c === 'rgba(0, 0, 0, 1)' ||
      c === '#111111' ||
      c === '#202124' ||
      c === '#222222' ||
      c === '#3c4043'
    );
  }

  function isGridline(color) {
    if (typeof color !== 'string') return false;
    const c = color.trim().toLowerCase();
    return (
      c === '#e0e0e0' ||
      c === '#d4d4d4' ||
      c === '#cccccc' ||
      c === '#d9d9d9' ||
      c === '#c0c0c0' ||
      c === '#e8eaed' ||
      c === '#dadce0' ||
      c === 'rgb(217, 217, 217)' ||
      c === 'rgb(224, 224, 224)' ||
      c === 'rgb(204, 204, 204)' ||
      c === 'rgb(218, 220, 224)'
    );
  }

  // ── Canvas Identification Helpers ───────────────────────────────────

  function isDocsCanvas(canvas) {
    if (!canvas) return false;
    if (currentApp !== 'docs' && !window.location.pathname.includes('/document/')) {
      return false;
    }
    if (canvas.classList && canvas.classList.contains('kix-canvas-tile-content')) {
      return true;
    }
    const className = canvas.className;
    if (typeof className === 'string' && className.indexOf('kix-canvas') !== -1) {
      return true;
    }
    return false;
  }

  function isSheetsCanvas(canvas) {
    if (!canvas) return false;
    // Don't intercept if current app is explicitly docs, slides, or drawings
    if (currentApp && currentApp !== 'sheets') return false;
    if (!window.location.pathname.includes('/spreadsheets/')) return false;

    // Guardrail: charts are never altered
    if (canvas.id && canvas.id.toLowerCase().includes('chart')) return false;
    if (typeof canvas.className === 'string' && canvas.className.toLowerCase().includes('chart')) {
      return false;
    }
    if (canvas.closest && canvas.closest('.waffle-chart-container, .goog-chart, [class*="chart"]')) {
      return false;
    }

    // Grid, waffle, and table canvases
    if (canvas.id && canvas.id.toLowerCase().includes('waffle')) return true;
    if (typeof canvas.className === 'string' && (canvas.className.includes('waffle') || canvas.className.includes('grid-canvas'))) {
      return true;
    }
    if (canvas.closest && canvas.closest('#waffle-canvas-container, #waffle-grid-container, .waffle-canvas-container, .grid-container')) {
      return true;
    }

    return true;
  }

  // Validate whether drawn source is user media (and NOT an internal canvas tile buffer)
  function isUserMedia(source) {
    if (!source) return false;

    // NEVER invert canvas-to-canvas blits (cached font glyph atlases or tile buffers)
    if (
      source instanceof HTMLCanvasElement ||
      (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)
    ) {
      return false;
    }

    // Standard HTML images
    if (source instanceof HTMLImageElement) return true;

    // SVG images
    if (typeof SVGImageElement !== 'undefined' && source instanceof SVGImageElement) return true;

    // Video frames
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) return true;

    // Decoded ImageBitmaps
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) return true;

    return false;
  }

  // ── Hook CanvasRenderingContext2D.prototype.drawImage ─────────────────
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    if (isDarkEnabled && currentMode === 'full' && isDocsCanvas(this.canvas) && isUserMedia(source)) {
      const prevFilter = this.filter;
      this.filter = prevFilter && prevFilter !== 'none'
        ? `${prevFilter} ${INVERT_FILTER}`
        : INVERT_FILTER;

      try {
        return originalDrawImage.call(this, source, ...args);
      } finally {
        this.filter = prevFilter;
      }
    }

    return originalDrawImage.apply(this, arguments);
  };

  // ── Hook CanvasRenderingContext2D.prototype.fillRect ──────────────────
  const originalFillRect = CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (isDarkEnabled && currentMode === 'full' && isSheetsCanvas(this.canvas)) {
      const fill = this.fillStyle;
      if (isWhiteOrLightSurface(fill)) {
        this.fillStyle = '#1e1f22';
        try {
          return originalFillRect.call(this, x, y, w, h);
        } finally {
          this.fillStyle = fill;
        }
      } else if (isHeaderSurface(fill)) {
        this.fillStyle = '#282a2e';
        try {
          return originalFillRect.call(this, x, y, w, h);
        } finally {
          this.fillStyle = fill;
        }
      }
    }

    return originalFillRect.apply(this, arguments);
  };

  // ── Hook CanvasRenderingContext2D.prototype.fillText ──────────────────
  const originalFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
    if (isDarkEnabled && currentMode === 'full' && isSheetsCanvas(this.canvas)) {
      const fill = this.fillStyle;
      if (isBlackOrDarkText(fill)) {
        this.fillStyle = '#e8eaed';
        try {
          return maxWidth !== undefined
            ? originalFillText.call(this, text, x, y, maxWidth)
            : originalFillText.call(this, text, x, y);
        } finally {
          this.fillStyle = fill;
        }
      }
    }

    return maxWidth !== undefined
      ? originalFillText.call(this, text, x, y, maxWidth)
      : originalFillText.call(this, text, x, y);
  };

  // ── Hook CanvasRenderingContext2D.prototype.strokeRect ────────────────
  const originalStrokeRect = CanvasRenderingContext2D.prototype.strokeRect;
  CanvasRenderingContext2D.prototype.strokeRect = function (x, y, w, h) {
    if (isDarkEnabled && currentMode === 'full' && isSheetsCanvas(this.canvas)) {
      const stroke = this.strokeStyle;
      if (isGridline(stroke)) {
        this.strokeStyle = '#333639';
        try {
          return originalStrokeRect.call(this, x, y, w, h);
        } finally {
          this.strokeStyle = stroke;
        }
      }
    }

    return originalStrokeRect.apply(this, arguments);
  };

  // ── Hook CanvasRenderingContext2D.prototype.stroke ────────────────────
  const originalStroke = CanvasRenderingContext2D.prototype.stroke;
  CanvasRenderingContext2D.prototype.stroke = function (...args) {
    if (isDarkEnabled && currentMode === 'full' && isSheetsCanvas(this.canvas)) {
      const stroke = this.strokeStyle;
      if (isGridline(stroke)) {
        this.strokeStyle = '#333639';
        try {
          return originalStroke.apply(this, args);
        } finally {
          this.strokeStyle = stroke;
        }
      }
    }

    return originalStroke.apply(this, args);
  };
})();
