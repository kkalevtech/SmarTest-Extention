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

function extractEmailsFromListAccounts(text) {
  const emails = new Set();
  const re = /["']?email["']?\s*:\s*["']([^"']+)["']/gi;
  let match;
  while ((match = re.exec(text)) !== null) {
    emails.add(match[1].toLowerCase().trim());
  }
  return [...emails];
}

// Returns the ListAccounts body, or null when this tab cannot be checked.
async function fetchListAccountsInTab(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        try {
          const resp = await fetch('https://accounts.google.com/ListAccounts?pid=1', {
            credentials: 'include',
            headers: { 'Referer': 'https://www.google.com/' }
          });
          return resp.ok ? await resp.text() : null;
        } catch {
          return null;
        }
      }
    });

    return typeof injection?.result === 'string' ? injection.result : null;
  } catch {
    return null;
  }
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

    const text = await fetchListAccountsInTab(tab.id);
    if (text === null) continue;

    checked = true;
    extractEmailsFromListAccounts(text).forEach(email => accounts.add(email));
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
    // Fetch authorized list and check
    getAuthorizedEmails().then(authorizedEmails => {
      const matched = (message.accounts || []).find(e => authorizedEmails.includes(e));
      if (matched) {
        setAuthorized(matched, 'content_script_list_accounts').then(() => sendResponse({ authorized: true }));
      } else {
        sendResponse({ authorized: false });
      }
    });
    return true;
  }
});

// Keep the toolbar badge in sync with both the toggle and auth state.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.enabled || changes.authorized) updateBadge();
});

updateBadge();
