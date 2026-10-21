// ── SmarTest background worker ──
// Authorization decides whether protection may run. A separate on/off flag
// (default: enabled) lets the user pause protection without losing the
// authorization check.

// ── Cloudflare Worker config ──
const WORKER_URL = 'https://smartest-auth.kkalev-tech.workers.dev';
const AUTH_TOKEN = 'smartest-token-2026';

const DEFAULT_ENABLED = true;

// ── Toggle state ──
async function getEnabled() {
  const { enabled } = await chrome.storage.local.get('enabled');
  return typeof enabled === 'boolean' ? enabled : DEFAULT_ENABLED;
}

async function getAuthorized() {
  const { authorized } = await chrome.storage.local.get('authorized');
  return authorized === true;
}

async function updateBadge() {
  try {
    const [authorized, enabled] = await Promise.all([getAuthorized(), getEnabled()]);

    let text;
    let color;
    if (!authorized) {
      text = 'AUTH';
      color = '#c62828';
    } else if (!enabled) {
      text = 'OFF';
      color = '#9e9e9e';
    } else {
      text = 'ON';
      color = '#2e7d32';
    }

    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
  } catch {}
}

// ── Google session check ──
// The account chooser keeps listing an address after sign-out, but Google
// removes its authentication cookies. Returns true (signed in), false (signed
// out) or null (cookie API unavailable).
const GOOGLE_SESSION_COOKIES = [
  'SID',
  'HSID',
  'SSID',
  'LSID',
  'APISID',
  'SAPISID',
  '__Secure-1PSID',
  '__Secure-3PSID',
  '__Secure-1PAPISID',
  '__Secure-3PAPISID',
  '__Secure-1PSIDTS',
  '__Secure-3PSIDTS'
];

async function hasGoogleSession() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'google.com' });
    if (!Array.isArray(cookies)) return null;
    return cookies.some(c => GOOGLE_SESSION_COOKIES.includes(c.name) && c.value);
  } catch {
    return null;
  }
}

// ── Auth state ──
async function setAuthorized(email, method) {
  await chrome.storage.local.set({ authorized: true, authEmail: email, authMethod: method, authReason: '' });
  console.log('[SmarTest] ✅ Authorized:', email, `(${method})`);
}
async function setUnauthorized(reason, debug) {
  await chrome.storage.local.set({ authorized: false, authEmail: '', authMethod: 'none', authReason: reason, authDebug: debug || '' });
}

// ── Fetch authorized emails from Cloudflare Worker ──
let currentAuthorizedEmails = null;

async function getAuthorizedEmails() {
  // Use cache if we already fetched successfully this session
  if (currentAuthorizedEmails) return currentAuthorizedEmails;

  try {
    console.log('[SmarTest] Fetching authorized emails from Worker...');
    const resp = await fetch(WORKER_URL, {
      headers: { 'X-Auth-Token': AUTH_TOKEN }
    });
    if (resp.ok) {
      const emails = await resp.json();
      if (Array.isArray(emails) && emails.length > 0) {
        currentAuthorizedEmails = emails.map(e => e.toLowerCase().trim());
        console.log('[SmarTest] Worker returned:', currentAuthorizedEmails);
        return currentAuthorizedEmails;
      }
      console.log('[SmarTest] Worker returned empty list');
    } else {
      console.log('[SmarTest] Worker returned', resp.status);
    }
  } catch (e) {
    console.log('[SmarTest] Worker fetch error:', e.message);
  }

  return [];
}

function clearEmailCache() {
  currentAuthorizedEmails = null;
}

// ── Method 1: Chrome profile email (fastest) ──
async function checkProfileEmail(authorizedEmails) {
  try {
    const info = await chrome.identity.getProfileUserInfo();
    return (info.email && authorizedEmails.includes(info.email)) ? info.email : null;
  } catch { return null; }
}

// ── Method 2: silent account detection in tabs that are already open ──
// Chrome has no genuinely hidden tab API, so never create a tab here. Instead
// ask a Google tab the user already has open for its ListAccounts response.
// This runs through chrome.scripting in the tab's own origin, so the request
// carries the user's real Google session cookies and nothing appears on screen.
const GOOGLE_TAB_PATTERNS = [
  'https://accounts.google.com/*',
  'https://mail.google.com/*',
  'https://www.google.com/*',
  'https://drive.google.com/*',
  'https://docs.google.com/*',
  'https://www.youtube.com/*'
];

// Runs inside a Google tab (injected via chrome.scripting). Reads the signed-in
// profile straight from the page: Gmail puts the address in document.title and
// every Google service renders an account chip with "Google Account: ... (email)".
// Sign-in pages and the account chooser are ignored — they list addresses that
// still require a password.
async function collectGoogleAccountsFromPage() {
  const emails = new Set();

  const add = value => {
    if (!value) return;
    const matches = String(value).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matches) matches.forEach(email => emails.add(email.toLowerCase()));
  };

  let checked = false;

  // Password field or an explicit sign-in URL: not an authenticated session.
  const passwordField = document.querySelector('input[type="password"]');
  const signInUrl = /accounts\.google\.com\/(?:v3\/)?(?:signin|ServiceLogin|identifier)\b/i.test(location.href);
  if (passwordField || signInUrl) {
    return { accounts: [], checked: true };
  }

  // accounts.google.com: ListAccounts is same-origin and authoritative. Never
  // read DOM emails here, because the account chooser lists signed-out accounts.
  if (location.hostname === 'accounts.google.com') {
    try {
      const resp = await fetch('https://accounts.google.com/ListAccounts?pid=1', {
        credentials: 'include'
      });
      if (resp.ok) {
        // A redirect to sign-in means the remembered account is not signed in.
        if (/ServiceLogin|AccountChooser|\/signin/i.test(resp.url)) {
          return { accounts: [], checked: true };
        }

        checked = true;
        const text = await resp.text();
        const re = /["']?email["']?\s*:\s*["']([^"']+)["']/gi;
        let match;
        while ((match = re.exec(text)) !== null) {
          emails.add(match[1].toLowerCase());
        }
      }
    } catch {}
    return { accounts: [...emails], checked };
  }

  // Gmail: "Inbox (1) - user@gmail.com - Gmail"
  add(document.title);

  // Google account chip (href is stable across locales)
  const nodes = document.querySelectorAll(
    'a[href*="SignOutOptions"], a[aria-label^="Google Account"], button[aria-label^="Google Account"], [data-email]'
  );
  for (const el of nodes) {
    add(el.getAttribute('aria-label'));
    add(el.getAttribute('data-email'));
    add(el.getAttribute('title'));
  }

  if (emails.size > 0) checked = true;

  return { accounts: [...emails], checked };
}

// Returns { accounts, checked } for a Google tab. checked === true means the
// page gave us a real signal (email found or ListAccounts responded).
async function readGoogleAccountsInTab(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: collectGoogleAccountsFromPage
    });

    if (injection?.result && Array.isArray(injection.result.accounts)) {
      return injection.result;
    }
  } catch {}

  return { accounts: [], checked: false };
}

async function checkOpenGoogleTabs() {
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: GOOGLE_TAB_PATTERNS });
  } catch {
    return { accounts: [], checked: false };
  }

  // Prefer accounts.google.com tabs: ListAccounts is same-origin there.
  tabs.sort((a, b) => Number((b.url || '').includes('accounts.google.com')) -
                       Number((a.url || '').includes('accounts.google.com')));

  const accounts = new Set();
  let checked = false;

  for (const tab of tabs) {
    if (typeof tab.id !== 'number') continue;

    const result = await readGoogleAccountsInTab(tab.id);
    if (!result.checked) continue;

    checked = true;
    result.accounts.forEach(email => accounts.add(email));
  }

  console.log('[SmarTest] Open Google tabs checked:', checked, 'accounts:', [...accounts]);
  return { accounts: [...accounts], checked };
}

// ── Guard ──
let isChecking = false;

// ── Combined check ──
async function checkAuthorization() {
  if (isChecking) {
    console.log('[SmarTest] Already checking, skipping');
    return await chrome.storage.local.get('authorized').then(s => s.authorized || false);
  }
  isChecking = true;
  try {
    console.log('[SmarTest] Checking authorization...');

    // A signed-out Google session invalidates protection immediately, even if
    // the account chooser still shows a remembered address.
    const session = await hasGoogleSession();
    if (session === false) {
      console.log('[SmarTest] Google session not found; signing out');
      await setUnauthorized('Not signed in to Google.', JSON.stringify({ session: false }));
      return false;
    }

    // Fetch authorized list from Cloudflare Worker
    clearEmailCache();
    const authorizedEmails = await getAuthorizedEmails();
    console.log('[SmarTest] Authorized emails:', authorizedEmails);

    // If the Worker is unreachable there is nothing to compare against.
    // Keep an existing success instead of locking the user out on a hiccup.
    if (authorizedEmails.length === 0) {
      console.log('[SmarTest] Authorized list unavailable; keeping current state');
      return await getAuthorized();
    }

    // 1. Profile email (immediate, no UI)
    const profileEmail = await checkProfileEmail(authorizedEmails);
    if (profileEmail) {
      await setAuthorized(profileEmail, 'chrome_profile');
      return true;
    }

    // 2. Existing Google tabs (silent — never creates tabs or windows)
    const { accounts, checked } = await checkOpenGoogleTabs();
    for (const email of accounts) {
      if (authorizedEmails.includes(email)) {
        await setAuthorized(email, 'list_accounts_tab');
        return true;
      }
    }

    // Accounts were actually observed and none matched -> definitive failure.
    if (checked) {
      await setUnauthorized(
        'No authorized Google account detected.',
        JSON.stringify({ foundAccounts: accounts })
      );
      return false;
    }

    // No silent verification was possible (e.g. no Google tab is open).
    // Preserve a previous authorization; otherwise report unauthorized.
    if (await getAuthorized()) {
      console.log('[SmarTest] No verification signal; keeping cached authorization');
      return true;
    }

    await setUnauthorized(
      'No Google session detected. Open Gmail in a tab, then click Refresh.',
      JSON.stringify({ foundAccounts: [] })
    );
    return false;
  } finally {
    isChecking = false;
  }
}

// ── Events ──
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get('enabled');
  if (typeof enabled !== 'boolean') {
    await chrome.storage.local.set({ enabled: DEFAULT_ENABLED });
  }
  updateBadge();
  checkAuthorization();
});

chrome.runtime.onStartup.addListener(() => {
  updateBadge();
  checkAuthorization();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkAuth') {
    checkAuthorization().then(a => sendResponse({ authorized: a }));
    return true;
  }
  if (message.action === 'verifyAccounts') {
    // Google session cookies are the source of truth: a remembered address on
    // the account chooser must not authorize anyone once the session is gone.
    hasGoogleSession().then(async session => {
      if (session === false) {
        await setUnauthorized('Not signed in to Google.', JSON.stringify({ session: false }));
        sendResponse({ authorized: false });
        return;
      }

      const authorizedEmails = await getAuthorizedEmails();
      const matched = (message.accounts || []).find(e => authorizedEmails.includes(e));
      if (matched) {
        await setAuthorized(matched, 'content_script_list_accounts');
        sendResponse({ authorized: true });
      } else {
        sendResponse({ authorized: false });
      }
    }).catch(() => sendResponse({ authorized: false }));
    return true;
  }
});

// Keep the toolbar badge in sync with both the toggle and auth state.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled || changes.authorized) updateBadge();
});

updateBadge();
