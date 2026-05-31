# SmarTest Extension

A browser extension that prevents websites from detecting when you switch tabs, lose focus, or enter fullscreen.

## Features

- **Email-based authorization** — only allows execution on authorized Chrome profiles
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

## Authorization Setup

The extension checks **ALL Google accounts** you're signed into in this browser (e.g. Gmail, YouTube, Google Drive) — not just the Chrome profile email. If any of them matches the authorized list, the extension works.

### 1. Set authorized emails

Edit `background.js` and replace the `AUTHORIZED_EMAILS` array:

```js
const AUTHORIZED_EMAILS = [
  'your-email@gmail.com',      // ← replace with your email
  'friend1@gmail.com',
  'friend2@gmail.com',
];
```

### 2. Ensure users are signed into Google (not Chrome)

The user just needs to be **signed into Google** in the browser (Gmail, YouTube, etc.). They do **not** need to "sign into Chrome" as a profile. As long as a Google account is active in any tab, the extension detects it.

To verify: open `https://mail.google.com` — if you see your inbox, you're signed in.

### 3. Allow incognito mode (optional)

After loading the extension:
1. Go to `chrome://extensions`
2. Find **SmarTest Extension**
3. Click **Details**
4. Toggle **Allow in incognito** on

> ⚠️ In incognito, the user must sign into Google again (incognito doesn't share session cookies).

### 4. Reload after changing the email list

After editing `background.js`, go to `chrome://extensions` and click the 🔄 refresh icon on the extension card.

## Usage

1. Click the **S** icon in the toolbar to open the popup
2. If authorized, the toggle UI appears. Click **Disable** to turn off protection, **Enable** to turn it back on.
3. The protection is **active by default** when a page loads
4. If the popup says "Reload the page", refresh the page to activate the content script

> **Note**: The script must be re-injected on page navigation. After installation, reload any open tabs for the extension to start working.

## How It Works

### Authorization flow

1. On install/startup, the **background service worker** (`background.js`) runs two checks:
   - **Fast path** — `chrome.identity.getProfileUserInfo()` gets the Chrome profile's primary email
   - **Full scan** — fetches Google's `ListAccounts` endpoint using session cookies, which returns **every** Google account signed into the browser (Gmail, YouTube, etc.)
2. If any of the detected emails matches the `AUTHORIZED_EMAILS` list, authorization passes
3. The result (`authorized: true/false`) is cached in `chrome.storage.local`
4. When any page loads, the **content script** (`content.js`) reads the cached auth state. If authorized, it proceeds; otherwise it exits silently
5. If no cached state exists yet (first load), the content script asks the background worker to check

### Blocker injection

If authorized, the content script injects `blocker.js` into the page's JavaScript context via a `<script>` tag loaded from `web_accessible_resources`. This avoids CSP issues and runs directly in the page's JS environment.

`blocker.js` creates a control element (`#lwys-ctv-port`) in the DOM and patches browser APIs:

- `Element.prototype.requestFullscreen` / `document.exitFullscreen` — blocked entirely
- `document.visibilityState` / `document.hidden` — always report `"visible"` / `false`
- `Document.prototype.hasFocus` — always returns `true`
- `focus` / `blur` / `pagehide` / `mouseleave` / `lostpointercapture` — intercepted and suppressed
- `requestAnimationFrame` — throttled to prevent hidden-state-based frame detection

### Toggle

The popup communicates with the content script via `chrome.tabs.sendMessage`. The content script updates the `data-enabled` attribute on the control element, which the patched APIs read to decide whether to block or allow.

## Project Structure

```
SmarTest-Extention/
├── manifest.json     # Extension manifest (MV3)
├── background.js     # Service worker — checks Chrome profile email against authorized list
├── content.js        # Content script — reads auth state, injects blocker.js, handles toggle
├── blocker.js        # Page-context script — patches browser APIs to block tracking
├── popup.html        # Popup UI (toggle or unauthorized message)
├── popup.js          # Popup logic — checks auth, shows toggle or "not authorized"
├── icons/            # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```
