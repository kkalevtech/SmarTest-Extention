// ── SmarTest content script ──
//
// Protection only runs when the browser is authorized (see background.js) AND
// the toolbar toggle is on (default: enabled). On Google pages the auth check
// runs here too, reading the signed-in address directly from the page so it
// works without opening anything.

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

// Sign-in screens and the account chooser can list remembered addresses that
// still require a password, so they must never count as a signed-in profile.
function isSignInPage() {
  if (document.querySelector('input[type="password"]')) return true;
  return /accounts\.google\.com\/(?:v3\/)?(?:signin|ServiceLogin|AccountChooser|identifier)\b/i.test(location.href);
}

function addEmailsFromValue(value, emails) {
  if (!value) return;
  const matches = String(value).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  if (matches) matches.forEach(email => emails.add(email.toLowerCase()));
}

// Read the signed-in address from the page itself. Gmail puts it in the title
// ("Inbox - user@gmail.com - Gmail") and Google services render an account chip
// whose aria-label is "Google Account: Name (user@gmail.com)".
function collectEmailsFromPage() {
  // accounts.google.com and sign-in screens list addresses that may not be
  // authenticated; the background worker checks those against session cookies.
  if (location.hostname === 'accounts.google.com' || isSignInPage()) return [];

  const emails = new Set();
  addEmailsFromValue(document.title, emails);

  const nodes = document.querySelectorAll(
    'a[href*="SignOutOptions"], a[aria-label^="Google Account"], button[aria-label^="Google Account"], [data-email]'
  );
  for (const el of nodes) {
    addEmailsFromValue(el.getAttribute('aria-label'), emails);
    addEmailsFromValue(el.getAttribute('data-email'), emails);
    addEmailsFromValue(el.getAttribute('title'), emails);
  }

  return [...emails];
}

function whenDomReady() {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise(resolve => {
    document.addEventListener('DOMContentLoaded', resolve, { once: true });
  });
}

// Chrome blocks cross-origin ListAccounts from mail.google.com, so the visible
// profile on the page is the reliable silent signal. Give the account chip a
// moment to render on single-page apps before falling back to ListAccounts.
async function collectGoogleAccounts() {
  if (isSignInPage()) return [];

  const emails = new Set();

  if (location.hostname !== 'accounts.google.com') {
    for (let attempt = 0; attempt < 5; attempt++) {
      collectEmailsFromPage().forEach(email => emails.add(email));
      if (emails.size > 0) break;
      if (attempt < 4) await new Promise(r => setTimeout(r, 500));
    }
  }

  if (emails.size === 0 || location.hostname === 'accounts.google.com') {
    const fromEndpoint = await fetchListAccounts();
    fromEndpoint.forEach(email => emails.add(email));
  }

  return [...emails];
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
  const { enabled, authorized } = await getState();

  // 1. Fast path — already authorized
  if (authorized) {
    if (enabled) injectBlocker(true);

    // A sign-in page or account chooser means the user may have just logged
    // out. Confirm with the background worker, which checks Google's session
    // cookies, instead of trusting the remembered address shown on the page.
    if (isOnGooglePage()) {
      await whenDomReady();
      if (isSignInPage()) {
        try {
          const resp = await chrome.runtime.sendMessage({ action: 'checkAuth' });
          if (resp?.authorized === false) setBlockerEnabled(false);
        } catch {}
      }
    }
    return;
  }

  // 2. On a Google page — read the signed-in profile from this page
  if (isOnGooglePage()) {
    await whenDomReady();

    const accounts = await collectGoogleAccounts();
    try {
      if (accounts.length > 0) {
        const resp = await chrome.runtime.sendMessage({ action: 'verifyAccounts', accounts });
        if (resp?.authorized && enabled) {
          injectBlocker(true);
        } else if (resp?.authorized === false) {
          setBlockerEnabled(false);
        }
      } else {
        // No trustworthy address on this page (sign-in screen, chooser, or the
        // account chip hasn't rendered). Let the background decide using its
        // session-cookie check.
        const resp = await chrome.runtime.sendMessage({ action: 'checkAuth' });
        if (resp?.authorized && enabled) injectBlocker(true);
        else if (resp?.authorized === false) setBlockerEnabled(false);
      }
    } catch {}
    return;
  }

  // 3. No cached state or cached false — ask the background worker. It checks
  //    the Chrome profile and any Google tabs that are already open.
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
