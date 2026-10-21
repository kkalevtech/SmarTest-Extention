# SmarTest Extension

A browser extension that prevents websites from detecting when you switch tabs, lose focus, or leave fullscreen.

## Features

- Fakes an active fullscreen session (`fullscreenElement`, `fullscreenEnabled`, and vendor-prefixed variants) so pages believe fullscreen is still on
- Makes `requestFullscreen` / `exitFullscreen` succeed without changing the real window, and suppresses `fullscreenchange` / `fullscreenerror` events
- Prevents visibility change detection (`visibilityState`, `hidden`, `webkit*`)
- Blocks focus/blur events on `document` and `window`
- Blocks `pagehide`, `mouseleave`, `lostpointercapture` events
- Overrides `hasFocus()` to always return `true`
- Throttles `requestAnimationFrame` when the page attempts to detect hidden state
- One-click on/off toggle from the toolbar popup — no account or login required

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
2. Use the **Protection** switch to turn the extension on or off
3. Protection is **ON by default**
4. Open tabs update immediately when you flip the switch — no page reload needed

> **Note**: Tabs that were already open before the extension was installed must be reloaded once so the content script can attach.

The toolbar badge shows the current state: **ON** (green) or **OFF** (grey).

## How It Works

On every page load, the **content script** (`content.js`) reads the `enabled` flag from `chrome.storage.local` (default `true`). If protection is enabled, it injects `blocker.js` into the page's JavaScript context via a `<script>` tag loaded from `web_accessible_resources`. This avoids CSP issues and runs directly in the page's JS environment.

`blocker.js` creates a control element (`#lwys-ctv-port`) in the DOM and patches browser APIs:

- `document.fullscreenElement` (plus `webkit*`, `moz*`, `ms*` aliases) reports `document.documentElement`, so pages always see an active fullscreen session
- `document.fullscreenEnabled` / `webkitIsFullScreen` / `mozFullScreen` report `true`
- `Element.prototype.requestFullscreen` (and prefixed variants) resolves successfully and records the requested element, then fires a synthetic `fullscreenchange`
- `Document.prototype.exitFullscreen` resolves without leaving the faked fullscreen state
- Real `fullscreenchange` / `fullscreenerror` events are suppressed, so pressing Escape cannot be detected
- `document.visibilityState` / `document.hidden` — always report `"visible"` / `false`
- `Document.prototype.hasFocus` — always returns `true`
- `focus` / `blur` / `pagehide` / `mouseleave` / `lostpointercapture` — intercepted and suppressed
- `requestAnimationFrame` — throttled to prevent hidden-state-based frame detection

### Toggle

The popup writes the `enabled` flag to `chrome.storage.local`. Content scripts in all open tabs listen for `chrome.storage.onChanged` and immediately switch the `data-enabled` attribute on the control element, which the patched APIs read to decide whether to block or allow. The background worker mirrors the state onto the toolbar badge.

## Project Structure

```
SmarTest-Extention/
├── manifest.json     # Extension manifest (MV3)
├── background.js     # Service worker — default state and toolbar badge
├── content.js        # Content script — reads the toggle flag, injects blocker.js
├── blocker.js        # Page-context script — patches browser APIs to block tracking
├── popup.html        # Popup UI with the on/off switch
├── popup.js          # Popup logic — reads and writes the toggle state
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
