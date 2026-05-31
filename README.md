# SmarTest Extension

A browser extension that prevents websites from detecting when you switch tabs, lose focus, or enter fullscreen.

## Features

- Blocks fullscreen requests and exit-fullscreen calls
- Prevents visibility change detection (`visibilityState`, `hidden`, `webkit*`)
- Blocks focus/blur events on `document` and `window`
- Blocks `pagehide`, `mouseleave`, `lostpointercapture` events
- Overrides `hasFocus()` to always return `true`
- Throttles `requestAnimationFrame` when the page attempts to detect hidden state
- One-click toggle from the toolbar popup

## Installation

### Chrome / Edge (Chromium-based)

1. Open the browser and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `SmarTest-Extention` folder
5. The extension now appears in the toolbar

### Firefox

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `manifest.json` from the folder
4. The extension loads temporarily (persistent installation requires signing via Mozilla Add-on Store)

## Usage

1. Click the **S** icon in the toolbar to open the popup
2. Click **Disable** to turn off protection, **Enable** to turn it back on
3. The protection is **active by default** when a page loads
4. If the popup says "Reload the page", refresh the page to activate the content script

> **Note**: The script must be re-injected on page navigation. After installation, reload any open tabs for the extension to start working.

## How It Works

The extension injects a content script that runs in the page context. It creates a control element (`#lwys-ctv-port`) in the DOM and patches browser APIs to block tracking mechanisms:

- `Element.prototype.requestFullscreen` / `document.exitFullscreen` — blocked entirely
- `document.visibilityState` / `document.hidden` — always report `"visible"` / `false`
- `Document.prototype.hasFocus` — always returns `true`
- `focus` / `blur` / `pagehide` / `mouseleave` / `lostpointercapture` — intercepted and suppressed
- `requestAnimationFrame` — throttled to prevent hidden-state-based frame detection

Toggling via the popup updates the `data-enabled` attribute on the control element, which the patched APIs read to decide whether to block or allow.

## Project Structure

```
SmarTest-Extention/
├── manifest.json     # Extension manifest (MV3)
├── content.js        # Content script — injects blocker.js + handles toggle messaging
├── blocker.js        # Page-context script — patches browser APIs to block tracking
├── popup.html        # Popup UI
├── popup.js          # Popup logic (toggle, state)
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
