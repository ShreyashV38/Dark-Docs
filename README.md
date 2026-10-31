# Dark Mode for Google Docs

A Chrome extension that adds a comprehensive dark mode to Google Docs, inverting the UI and editor canvas to reduce eye strain in low-light environments.

## Features
*   **Full Window Inversion**: Applies a dark theme to the entire Google Docs window, including the title bar, menu bar, toolbar, ruler, and the editor canvas itself.
*   **Two Rendering Strategies**:
    *   **Targeted Override (Recommended)**: Selectively preserves media elements and automatically hooks `CanvasRenderingContext2D.prototype.drawImage` in the page's main world to pre-invert embedded canvas images, restoring their true, natural colors.
    *   **CSS Filter (Quick)**: Uses a blanket `filter: invert()` on the page for a fast, uniform dark theme.
*   **Popup UI**: Easy-to-use toggle and strategy selector accessible directly from the extension popup.

## Known Issues

Currently, there are a few limitations due to how Google Docs dynamically renders its content:

1.  **Dark Themes Converting to Light**: Elements that already have a dark background (like syntax-highlighted code blocks with dark themes) may get inverted into light themes when the extension is turned on. The blanket inversion doesn't distinguish between already-dark and light elements perfectly.

## Future Scope

*   **Google Workspace Support**: Expand functionality to support other Google Workspace applications, starting with **Google Sheets** and Google Slides.
*   **Smart Luminance Checking**: Refine the targeted strategy to accurately detect elements that are already dark and prevent them from being inverted to light.
*   **Customization Options**: Allow users to fine-tune the darkness level, tint, and contrast to their personal preference.

## Installation
1.  Clone this repository or download the source code.
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Enable "Developer mode" in the top right corner.
4.  Click "Load unpacked" and select the directory containing this extension's files.
