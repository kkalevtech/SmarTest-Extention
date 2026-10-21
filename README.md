# SmarTest Extension

A browser extension that prevents websites from detecting when you switch tabs, lose focus, or leave fullscreen.

## Features

- **Email-based authorization** — protection only runs for Google accounts on the authorized list
- **On/off toggle** — pause or resume protection from the toolbar at any time
- Fakes an active fullscreen session (`fullscreenElement`, `fullscreenEnabled`, and vendor-prefixed variants) so pages believe fullscreen is still on
- Makes `requestFullscreen` / `exitFullscreen` succeed without changing the real window, and suppresses `fullscreenchange` / `fullscreenerror` events
- Prevents visibility change detection (`visibilityState`, `hidden`, `webkit*`)
- Blocks focus/blur events on `document` and `window`
- Blocks `pagehide`, `mouseleave`, `lostpointercapture` events
- Overrides `hasFocus()` to always return `true`
- Throttles `requestAnimationFrame` when the page attempts to detect hidden state

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

## Authorization

The extension checks **all Google accounts** you're signed into in this browser (Gmail, YouTube, Google Drive, etc.), not just the Chrome profile email. If any of them is on the authorized list, protection is unlocked.

The authorized list is served by the Cloudflare Worker configured at the top of `background.js`:

```js
const WORKER_URL = 'https://smartest-auth.kkalev-tech.workers.dev';
const AUTH_TOKEN = 'smartest-token-2026';
```

### Signing in

1. Make sure you are signed into Google in this browser (open `https://mail.google.com` to check)
2. Open the popup — it shows **✅ Authorized** with the matched email
3. If it shows **❌ Unauthorized**, click **🔄 Refresh authorization**

The authorization result is cached in `chrome.storage.local` and re-checked on install and browser startup.

### Incognito mode (optional)

1. Go to `chrome://extensions`
2. Find **SmarTest Extension** → **Details**
3. Enable **Allow in incognito**

> ⚠️ In incognito you must sign into Google again (incognito doesn't share session cookies).

## Usage

1. Click the **S** icon in the toolbar to open the popup
2. Once authorized, use the **Protection** switch to turn protection on or off
3. Protection is **ON by default**
4. Open tabs update immediately when you flip the switch — no page reload needed
5. If authorization expires, the switch is locked until you refresh authorization

The toolbar badge shows the current state:

| Badge | Meaning |
| ----- | ------- |
| **ON** (green) | Authorized and protection is on |
| **OFF** (grey) | Authorized but protection is paused |
| **AUTH** (red) | Not authorized — protection is locked |

> **Note**: Tabs that were already open before the extension was installed must be reloaded once so the content script can attach.

## How It Works

### Authorization flow

1. On install/startup, the **background service worker** (`background.js`) runs two checks:
   - **Fast path** — `chrome.identity.getProfileUserInfo()` gets the Chrome profile's primary email
   - **Full scan** — opens a background Google tab and scans it for signed-in account emails
2. Detected emails are compared against the list fetched from the Cloudflare Worker
3. If any email matches, the result (`authorized: true`) is cached in `chrome.storage.local`
4. When a page loads, the **content script** (`content.js`) reads both the cached auth state and the on/off flag. Protection is injected only when **authorized && enabled**
5. On Google pages the content script can additionally use a same-origin `ListAccounts` request, which is the most reliable way to enumerate signed-in accounts

### Blocker injection

When protection is active, the content script injects `blocker.js` into the page's JavaScript context via a `<script>` tag loaded from `web_accessible_resources`. This avoids CSP issues and runs directly in the page's JS environment.

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

### Toggle and auth changes

The popup writes the `enabled` flag to `chrome.storage.local`. Content scripts in all open tabs listen for `chrome.storage.onChanged` and immediately:

- inject the blocker when **authorized && enabled**
- switch `data-enabled` to `false` when protection is paused or authorization is lost

The background worker mirrors the combined state onto the toolbar badge.

## Project Structure

```
SmarTest-Extention/
├── manifest.json     # Extension manifest (MV3)
├── background.js     # Service worker — authorization checks, toggle state, toolbar badge
├── content.js        # Content script — auth gate, reads toggle, injects blocker.js
├── blocker.js        # Page-context script — patches browser APIs to block tracking
├── popup.html        # Popup UI with auth status and the on/off switch
├── popup.js          # Popup logic — reads auth/toggle state, refresh and toggle actions
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
