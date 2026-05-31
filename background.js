// ── Cloudflare Worker config ──
const WORKER_URL = 'https://smartest-auth.kkalev-tech.workers.dev';
const AUTH_TOKEN = 'smartest-token-2026';

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

// ── Method 2: Google account detection via background tab ──
// A real browser tab uses the user's actual cookie jar (not the extension's
// partitioned cookie store), so Google sees valid session cookies and returns
// the logged-in accounts.
const DISCOVERY_URLS = [
  { url: 'https://accounts.google.com/SignOutOptions', wait: 2000 },
  { url: 'https://myaccount.google.com/?hl=en', wait: 4000 },
];

async function extractEmailsFromTab(tabId) {
  try {
    const [htmlResult] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        html: document.body?.innerHTML || '',
        text: document.body?.innerText || '',
        title: document.title || ''
      })
    });

    const { html, text, title } = htmlResult?.result || {};
    console.log('[SmarTest] Tab title:', title);
    console.log('[SmarTest] Tab HTML length:', html?.length || 0);

    const emails = new Set();

    // Pattern 1: "email":"user@domain.com", email:'user@domain.com'
    const p1 = html.match(/["']?email["']?\s*[:=]\s*["']([^"']+@[^"']+)["']/gi);
    if (p1) p1.forEach(s => {
      const m = s.match(/([a-zA-Z0-9.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) emails.add(m[1].toLowerCase());
    });

    // Pattern 2: data-email / aria-label attributes
    const p2 = html.match(/(?:data-email|data-accountemail|aria-label)\s*=\s*["']([^"']+@[^"']+)["']/gi);
    if (p2) p2.forEach(s => {
      const m = s.match(/([a-zA-Z0-9.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) emails.add(m[1].toLowerCase());
    });

    // Pattern 3: Plain text emails
    if (text) {
      const p3 = text.match(/[a-zA-Z0-9.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (p3) p3.forEach(e => emails.add(e.toLowerCase()));
    }

    const result = [...emails];
    console.log('[SmarTest] Extracted emails:', result);
    return result;
  } catch (e) {
    console.log('[SmarTest] extractEmailsFromTab error:', e.message);
    return [];
  }
}

async function tryUrl(urlObj) {
  const { url, wait } = urlObj;
  return new Promise(resolve => {
    let cleanedUp = false;
    function cleanup(tabId) {
      if (cleanedUp) return;
      cleanedUp = true;
      try { if (tabId) chrome.tabs.remove(tabId); } catch {}
    }

    const timeout = setTimeout(() => {
      console.log(`[SmarTest] Tab ${url} timed out`);
      resolve([]);
    }, 15000);

    chrome.tabs.create({ url, active: false }, tab => {
      function onUpdated(tabId, info) {
        if (tabId !== tab.id || info.status !== 'complete') return;

        setTimeout(async () => {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(onUpdated);

          const emails = await extractEmailsFromTab(tab.id);
          console.log(`[SmarTest] ${url} found:`, emails);

          cleanup(tab.id);
          resolve(emails);
        }, wait);
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

async function checkViaDiscoveryTab() {
  for (const entry of DISCOVERY_URLS) {
    const emails = await tryUrl(entry);
    if (emails.length > 0) {
      console.log('[SmarTest] Got emails from:', entry.url, emails);
      return emails;
    }
  }
  return [];
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

    // 1. Profile email (immediate)
    const profileEmail = await checkProfileEmail(authorizedEmails);
    if (profileEmail) {
      await setAuthorized(profileEmail, 'chrome_profile');
      return true;
    }

    // 2. Google account detection via background tab
    const accounts = await checkViaDiscoveryTab();
    for (const email of accounts) {
      if (authorizedEmails.includes(email)) {
        await setAuthorized(email, 'list_accounts_tab');
        return true;
      }
    }

    await setUnauthorized(
      'No authorized Google account detected.',
      JSON.stringify({ foundAccounts: accounts })
    );
    return false;
  } finally {
    isChecking = false;
  }
}

// ── Events ──
chrome.runtime.onInstalled.addListener(() => { console.log('[SmarTest] Installed'); checkAuthorization(); });
chrome.runtime.onStartup.addListener(() => { console.log('[SmarTest] Startup'); checkAuthorization(); });

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
