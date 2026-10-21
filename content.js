// ── SmarTest content script ──
//
// Protection only runs when the browser is authorized (see background.js) AND
// the toolbar toggle is on (default: enabled). The auth logic is mirrored here
// so it also works on Google pages, where a same-origin ListAccounts request
// can see every signed-in account.

const DEFAULT_ENABLED = true;

const GOOGLE_DOMAINS = [
  'accounts.google.com',
  'mail.google.com',
  'google.com',
  'www.google.com',
  'drive.google.com',
  'docs.google.com',
  'youtube.com',
  'www.youtube.com',
];

let injected = false;

function isEnabled(value) {
  return typeof value === 'boolean' ? value : DEFAULT_ENABLED;
}

function isOnGooglePage() {
  return GOOGLE_DOMAINS.some(d => location.hostname === d);
}

// Tell blocker.js (running in the page context) whether to block or not.
function setBlockerEnabled(enabled) {
  const root = document.documentElement;
  if (!root) return;

  const flag = enabled ? 'true' : 'false';
  root.dataset.smartestEnabled = flag;
  const port = document.getElementById('lwys-ctv-port');
  if (port) port.dataset.enabled = flag;
}

function injectBlocker(enabled) {
  // Firefox can run content scripts before <html> exists.
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', () => injectBlocker(enabled), { once: true });
    return;
  }

  if (injected) {
    setBlockerEnabled(enabled);
    return;
  }
  injected = true;

  // blocker.js reads this attribute when it creates its control element.
  setBlockerEnabled(enabled);

  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('blocker.js');
  script.onload = () => {
    setBlockerEnabled(enabled);
    script.remove();
  };
  document.documentElement.appendChild(script);
}

async function getState() {
  const { enabled, authorized } = await chrome.storage.local.get(['enabled', 'authorized']);
  return {
    enabled: isEnabled(enabled),
    authorized: authorized === true,
    hasAuthState: typeof authorized === 'boolean',
  };
}

// Apply the auth + toggle state to the current tab.
async function refreshProtection() {
  const { enabled, authorized } = await getState();
  if (authorized && enabled) {
    injectBlocker(true);
  } else {
    setBlockerEnabled(false);
  }
}

async function init() {
  const { enabled, authorized, hasAuthState } = await getState();

  // 1. Fast path — already authorized
  if (authorized) {
    if (enabled) injectBlocker(true);
    return;
  }

  // 2. On a Google page → same-origin ListAccounts WILL work
  if (isOnGooglePage()) {
    const accounts = await fetchListAccounts();
    if (accounts.length > 0) {
      const resp = await chrome.runtime.sendMessage({ action: 'verifyAccounts', accounts });
      if (resp?.authorized && enabled) injectBlocker(true);
    }
    return;
  }

  // 3. Non-Google page with cached false — still try ListAccounts
  if (hasAuthState) {
    const accounts = await fetchListAccounts();
    if (accounts.length > 0) {
      const resp = await chrome.runtime.sendMessage({ action: 'verifyAccounts', accounts });
      if (resp?.authorized && enabled) injectBlocker(true);
    }
    return; // Respect cached false
  }

  // 4. No cached state — ask background
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    if (response?.authorized && enabled) injectBlocker(true);
  } catch {}
}

async function fetchListAccounts(retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      // Small delay so page's auth is settled (cookies ready)
      if (attempt > 1) await new Promise(r => setTimeout(r, 1500));

      const resp = await fetch('https://accounts.google.com/ListAccounts?pid=1', {
        credentials: 'include',
        headers: { 'Referer': 'https://www.google.com/' }
      });
      console.log(`[SmarTest] ListAccounts attempt ${attempt}: status ${resp.status}`);

      if (!resp.ok) {
        const body = await resp.text().catch(() => '(unreadable)');
        console.log(`[SmarTest] ListAccounts body (${resp.status}):`, body.substring(0, 300));
        continue;
      }

      const text = await resp.text();
      console.log(`[SmarTest] ListAccounts response length: ${text.length}`);

      const emails = [];
      const re = /["']?email["']?\s*:\s*["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(text)) !== null) {
        const email = m[1].toLowerCase();
        if (!emails.includes(email)) emails.push(email);
      }
      console.log(`[SmarTest] ListAccounts found emails:`, emails);
      return emails;
    } catch (e) {
      console.log(`[SmarTest] fetchListAccounts attempt ${attempt} error:`, e.message);
    }
  }
  return [];
}

// React to the popup toggle and auth changes in every open tab, no reload needed.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled || changes.authorized) {
    refreshProtection();
  }
});

init();
