const DEFAULT_ENABLED = true;

const toggleBtn = document.getElementById('toggleBtn');
const statusIndicator = document.getElementById('statusIndicator');
const authIndicator = document.getElementById('authIndicator');
const authEmail = document.getElementById('authEmail');
const refreshBtn = document.getElementById('refreshBtn');
const hint = document.getElementById('hint');

function isEnabled(value) {
  return typeof value === 'boolean' ? value : DEFAULT_ENABLED;
}

async function getState() {
  const state = await chrome.storage.local.get(['enabled', 'authorized', 'authEmail']);
  return {
    enabled: isEnabled(state.enabled),
    authorized: state.authorized === true,
    email: state.authEmail || '',
  };
}

function render(state) {
  // Authorization
  if (state.authorized) {
    authIndicator.textContent = '✅ Authorized';
    authIndicator.className = 'status status-ok';
    authEmail.textContent = state.email || 'Authorized account';
  } else {
    authIndicator.textContent = '❌ Unauthorized';
    authIndicator.className = 'status status-no';
    authEmail.textContent = 'No authorized Google account detected.';
  }

  // Protection switch and status
  toggleBtn.classList.toggle('on', state.enabled);
  toggleBtn.setAttribute('aria-checked', String(state.enabled));
  toggleBtn.disabled = !state.authorized;

  if (!state.authorized) {
    statusIndicator.textContent = 'Protection is locked';
    statusIndicator.className = 'status status-no';
    hint.textContent = 'Sign in to an authorized Google account, then click Refresh.';
  } else if (state.enabled) {
    statusIndicator.textContent = 'Protection is ON';
    statusIndicator.className = 'status status-ok';
    hint.textContent = 'Tabs opened before installing the extension need a reload.';
  } else {
    statusIndicator.textContent = 'Protection is OFF';
    statusIndicator.className = 'status status-off';
    hint.textContent = 'Toggle protection back on to resume blocking.';
  }
}

async function loadState() {
  render(await getState());
}

async function toggle() {
  const state = await getState();
  if (!state.authorized) return;

  const next = !state.enabled;
  // Content scripts in every open tab react to this change immediately.
  await chrome.storage.local.set({ enabled: next });
  await loadState();
}

async function refreshAuth() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = 'Checking...';
  authIndicator.textContent = 'Checking authorization...';
  authIndicator.className = 'status status-pending';

  try {
    await chrome.runtime.sendMessage({ action: 'checkAuth' });
  } catch {}

  refreshBtn.disabled = false;
  refreshBtn.textContent = '🔄 Refresh authorization';
  await loadState();
}

document.addEventListener('DOMContentLoaded', () => {
  toggleBtn.addEventListener('click', toggle);
  refreshBtn.addEventListener('click', refreshAuth);

  // Reflect changes made from other tabs / popups / the background worker.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.enabled || changes.authorized || changes.authEmail) {
      loadState();
    }
  });

  loadState();
});
