# DarkSpace — Unified Dark Mode Suite for Google Workspace

**DarkSpace** is a high-precision, Manifest V3 Chrome extension providing a unified dark mode experience across Google Workspace and Google web applications that lack native desktop dark modes.

---

## 🚀 Supported Applications

DarkSpace automatically detects and adapts to the active application route:

| Application | Scope / URL | Dark Mode Strategy |
| :--- | :--- | :--- |
| **Google Docs** | `docs.google.com/document/*` | Smart Canvas Hook (media preservation) + Material 3 Toolbar Theme |
| **Google Sheets** | `docs.google.com/spreadsheets/*` | Grid Canvas Interception (white/text/gridline remapping) + Dark Shell |
| **Google Classroom**| `classroom.google.com/*` | Scoped DOM Material 3 Theme (unaltered banners, avatars & thumbnails) |
| **Google Slides** | `docs.google.com/presentation/*` | Dark Workspace Shell & Filmstrip (unaltered slide canvas) |
| **Google Forms** | `docs.google.com/forms/*` | Scoped Form Builder & Respondent View Cards |
| **Google Drawings** | `docs.google.com/drawings/*` | Dark Workspace Shell & Toolbars (unaltered drawing canvas) |
| **Google Scholar** | `scholar.google.com/*` | Scoped Search Results, Citation Modals & Sidebars |
| **Google Translate**| `translate.google.com/*` | Dark Translation Panels, Language Bars & Dictionary Cards |
| **Google Contacts** | `contacts.google.com/*` | Dark Contact List Rows, Sidebar & Detail Views |

---

## 🧠 High-Precision Canvas Architecture

Google Docs and Google Sheets render their main editing surfaces using HTML5 `<canvas>` rendering contexts rather than standard HTML DOM nodes. DarkSpace utilizes a route-aware `MAIN` world execution hook (`canvas-hook.js`) injected at `document_start` before the first frame is rendered:

### 1. Google Docs (`/document/`)
- Intercepts `CanvasRenderingContext2D.prototype.drawImage`.
- Detects user media (`HTMLImageElement`, `ImageBitmap`, `HTMLVideoElement`, `SVGImageElement`) drawn onto document tiles (`.kix-canvas-tile-content`).
- Pre-inverts media before it hits the canvas buffer. When the page-level dark theme filter is applied, double-inversion restores all photos and graphics to their natural, original colors without distortion.

### 2. Google Sheets (`/spreadsheets/`)
- Intercepts spreadsheet grid context operations (`fillRect`, `fillText`, `strokeRect`, `stroke`).
- **Remapping Rules (Full Dark Mode):**
  - Default white cell backgrounds (`#ffffff`, `white`, `rgb(255, 255, 255)`) are remapped to dark surface `#1e1f22`.
  - Default light gridlines (`#e0e0e0`, `#d4d4d4`, `rgb(217, 217, 217)`) are remapped to subtle borders `#333639`.
  - Default black cell text (`#000000`, `black`, `rgb(0, 0, 0)`) is remapped to crisp light text `#e8eaed`.
  - Header cells (`#f8f9fa`, `#f1f3f4`) are remapped to elevated surface `#282a2e`.
- **Color Preservation Guardrail:** Custom user cell background fills (e.g., green, yellow, red status highlights), conditional formatting rules, chart canvases (`.waffle-chart-container`), and embedded images are **strictly preserved** and never inverted.

### 3. Google Slides & Drawings (`/presentation/`, `/drawings/`)
- Presentation and drawing canvases remain 100% true-to-life by default so media and slide decks maintain design integrity. Only the surrounding workspace shell, filmstrip panel, and speaker notes are darkened.

---

## 🎛️ Popup Interface & Controls

DarkSpace features a streamlined, non-technical interface with three primary controls:

1. **Master Dark Mode Switch:** Turn DarkSpace On or Off globally across all Google services.
2. **Enable for This App:** Toggle dark theme specifically for the currently active Google app (saved independently per service in `chrome.storage.local`).
3. **Appearance Mode (Segmented Toggle for Docs/Sheets/Slides):**
   - **Full Dark:** Dark UI chrome + dark document page / spreadsheet grid.
   - **UI Only:** Dark toolbars, menus, and sidebars + original white document page / spreadsheet grid.

---

## 📦 Installation (Load Unpacked)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/multica-ai/andrej-karpathy-skills.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left corner.
5. Select the project directory (`dark-mode`).
6. Navigate to any supported Google application (e.g. [Google Docs](https://docs.google.com/document), [Google Sheets](https://docs.google.com/spreadsheets), or [Google Classroom](https://classroom.google.com)) and click the **DarkSpace** extension icon to customize your theme.

---

## 🔒 Security & Performance

- **Manifest V3 Compliant:** Uses modern service and content script standards.
- **Zero External Dependencies:** 100% self-contained JavaScript and CSS. No remote fonts, trackers, or external scripts.
- **Minimal Permissions:** Only requires `storage` and `activeTab`.
- **Zero FOUC (Flash of Unstyled Content):** Content scripts execute at `document_start` to apply dataset attributes before DOM body parsing.

---

## 📄 License

MIT License.
