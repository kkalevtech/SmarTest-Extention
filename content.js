// ── Authorization gate ──
//
// KEY INSIGHT: MV3 service workers have an isolated cookie store, so
// chrome.cookies.getAll() from background.js never sees Google session
// cookies. The ONLY reliable way to detect Google accounts is from a
// content script running on a Google page (same-origin credentialed fetch).
//
// Strategy:
//   1. Fast path — cached authorized=true → inject blocker
//   2. If current page is a Google property → always try ListAccounts
//   3. Otherwise → respect cached state (fallback to background check)

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

function isOnGooglePage() {
  return GOOGLE_DOMAINS.some(d => location.hostname === d);
}

async function init() {
  // 1. Fast path — already authorized
  const cached = await chrome.storage.local.get('authorized');
  if (cached.authorized === true) {
    console.log('[SmarTest] Cached authorized — injecting blocker');
    return injectBlocker();
  }

  // 2. On a Google page → same-origin ListAccounts WILL work
  if (isOnGooglePage()) {
    console.log('[SmarTest] On Google page, trying ListAccounts...');
    const accounts = await fetchListAccounts();
    console.log('[SmarTest] ListAccounts returned:', accounts);
    if (accounts.length > 0) {
      const resp = await chrome.runtime.sendMessage({ action: 'verifyAccounts', accounts });
      console.log('[SmarTest] verifyAccounts response:', resp);
      if (resp.authorized) {
        return injectBlocker();
      }
    }
    // If no accounts found even on Google page, user really isn't signed in
    return;
  }

  // 3. Non-Google page with cached false — check with background anyway
  if (cached.authorized === false) {
    // Still try fetchListAccounts (works if Google cookies exist globally)
    const accounts = await fetchListAccounts();
    if (accounts.length > 0) {
      const resp = await chrome.runtime.sendMessage({ action: 'verifyAccounts', accounts });
      if (resp.authorized) return injectBlocker();
    }
    return; // Respect cached false
  }

  // 4. No cached state — ask background
  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    if (response.authorized) injectBlocker();
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

// ── Blocker injection ──
function injectBlocker() {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('blocker.js');
  script.onload = () => script.remove();
  document.documentElement.appendChild(script);
}

init();
