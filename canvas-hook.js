/**
 * Dark Mode for Google Docs — Canvas drawImage Hook
 *
 * Runs in the MAIN world execution context to intercept
 * CanvasRenderingContext2D.prototype.drawImage calls.
 *
 * When targeted dark mode is active and an image is drawn onto a Google Docs
 * canvas tile (.kix-canvas-tile-content), this hook pre-inverts the image.
 *
 * When the browser applies the CSS `invert(...)` filter to the canvas tile,
 * the double-inversion restores the image to its natural, original colors!
 */

(function () {
  'use strict';

  if (window.__gdocs_dark_canvas_hook_installed__) return;
  window.__gdocs_dark_canvas_hook_installed__ = true;

  const INVERT_FILTER = 'invert(1) hue-rotate(180deg)';
  let isDarkTargeted = false;

  // Fast check synced with documentElement class
  function updateState() {
    isDarkTargeted = document.documentElement.classList.contains('gdocs-dark-targeted');
  }

  // Observe class changes on <html>
  const observer = new MutationObserver(updateState);
  if (document.documentElement) {
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    updateState();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      });
      updateState();
    });
  }

  // Listen for explicit redraw requests from content script
  window.addEventListener('gdocs-dark-refresh-tiles', () => {
    updateState();
    requestRepaint();
  });

  function requestRepaint() {
    window.dispatchEvent(new Event('resize'));
  }

  // Validate whether the canvas is part of Google Docs editing surface
  function isDocsCanvas(canvas) {
    if (!canvas) return false;
    if (canvas.classList && canvas.classList.contains('kix-canvas-tile-content')) {
      return true;
    }
    const className = canvas.className;
    if (typeof className === 'string' && className.indexOf('kix-canvas') !== -1) {
      return true;
    }
    return false;
  }

  // Validate whether the drawn source is user media (and NOT an internal canvas tile buffer)
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
    if (source instanceof HTMLImageElement) {
      return true;
    }

    // SVG images
    if (typeof SVGImageElement !== 'undefined' && source instanceof SVGImageElement) {
      return true;
    }

    // Video frames
    if (typeof HTMLVideoElement !== 'undefined' && source instanceof HTMLVideoElement) {
      return true;
    }

    // Decoded ImageBitmaps (used by modern browsers and web workers for images)
    if (typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap) {
      return true;
    }

    return false;
  }

  // ── Hook CanvasRenderingContext2D.prototype.drawImage ─────────────────
  const originalDrawImage = CanvasRenderingContext2D.prototype.drawImage;

  CanvasRenderingContext2D.prototype.drawImage = function (source, ...args) {
    if (isDarkTargeted && isDocsCanvas(this.canvas) && isUserMedia(source)) {
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
})();
