// ── Authorized email list ──
const AUTHORIZED_EMAILS = [
  'constantinekalev27@itpg-varna.bg'
  //'magicpet2008@gmail.com'
];

// ── Auth state ──
async function setAuthorized(email, method) {
  await chrome.storage.local.set({ authorized: true, authEmail: email, authMethod: method, authReason: '' });
  console.log('[SmarTest] ✅ Authorized:', email, `(${method})`);
}
async function setUnauthorized(reason, debug) {
  await chrome.storage.local.set({ authorized: false, authEmail: '', authMethod: 'none', authReason: reason, authDebug: debug || '' });
}

// ── Method 1: Chrome profile email (fastest) ──
async function checkProfileEmail() {
  try {
    const info = await chrome.identity.getProfileUserInfo();
    return info.email || null;
  } catch { return null; }
}

// ── Method 2: Google account detection via background tab ──
// A real browser tab uses the user's actual cookie jar (not the extension's
// partitioned cookie store), so Google sees valid session cookies and returns
// the logged-in accounts. We extract emails directly from the DOM — no CORS,
// no cookie masking, no SAPISIDHASH needed.
//
// We try several URLs in sequence since Google deprecates/updates endpoints.
// SignOutOptions is tried FIRST — it's a static HTML page that lists ALL
// signed-in accounts (not just the primary one), and renders immediately.
const DISCOVERY_URLS = [
  { url: 'https://accounts.google.com/SignOutOptions', wait: 2000 },  // All accounts, fast
  { url: 'https://myaccount.google.com/?hl=en', wait: 4000 },         // Primary account, SPA
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

    // Pattern 1: Common Google data attribute + JSON patterns
    //   "email":"user@domain.com", email:'user@domain.com', "user@domain.com" in email context
    const p1 = html.match(/["']?email["']?\s*[:=]\s*["']([^"']+@[^"']+)["']/gi);
    if (p1) p1.forEach(s => {
      const m = s.match(/([a-zA-Z0-9.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) emails.add(m[1].toLowerCase());
    });

    // Pattern 2: aria-label / data-email / data-accountemail attributes
    const p2 = html.match(/(?:data-email|data-accountemail|aria-label)\s*=\s*["']([^"']+@[^"']+)["']/gi);
    if (p2) p2.forEach(s => {
      const m = s.match(/([a-zA-Z0-9.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (m) emails.add(m[1].toLowerCase());
    });

    // Pattern 3: Plain text email addresses
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
  const { url, wait } = typeof urlObj === 'string' ? { url: urlObj, wait: 2000 } : urlObj;
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

    // 1. Profile email (immediate, no tab needed)
    const profileEmail = await checkProfileEmail();
    if (profileEmail && AUTHORIZED_EMAILS.includes(profileEmail)) {
      await setAuthorized(profileEmail, 'chrome_profile');
      return true;
    }

    // 2. Google account detection via real browser tab (uses user's cookies, bypasses MV3 partition)
    const accounts = await checkViaDiscoveryTab();
    for (const email of accounts) {
      if (AUTHORIZED_EMAILS.includes(email)) {
        await setAuthorized(email, 'list_accounts_tab');
        return true;
      }
    }

    await setUnauthorized(
      'No authorized Google account detected.',
      JSON.stringify({ foundAccounts: accounts, hint: 'Open Gmail and sign in, then click Refresh. Check console for details.' })
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
  // Secondary path: content script found accounts on a Google page
  if (message.action === 'verifyAccounts') {
    const matched = (message.accounts || []).find(e => AUTHORIZED_EMAILS.includes(e));
    if (matched) {
      setAuthorized(matched, 'content_script_list_accounts').then(() => sendResponse({ authorized: true }));
    } else {
      sendResponse({ authorized: false });
    }
    return true;
  }
});
