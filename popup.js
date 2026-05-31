async function refreshAuth() {
  document.getElementById('statusIndicator').textContent = 'Checking...';
  document.getElementById('statusIndicator').className = 'status-no';
  await chrome.runtime.sendMessage({ action: 'checkAuth' });
  await updateUI();
}

async function updateUI() {
  const auth = await chrome.storage.local.get(['authorized', 'authEmail', 'authMethod']);
  const indicator = document.getElementById('statusIndicator');
  const icon = document.getElementById('authIcon');
  const title = document.getElementById('authTitle');
  const desc = document.getElementById('authDesc');
  const detail = document.getElementById('authDetail');
  const hint = document.getElementById('hint');

  if (auth.authorized) {
    indicator.textContent = '✅ Authorized';
    indicator.className = 'status-ok';
    icon.textContent = '✅';
    title.textContent = 'Authorized';
    desc.textContent = 'Protection active.';
    detail.textContent = auth.authEmail || '';
    hint.textContent = '';
  } else {
    indicator.textContent = '❌ Unauthorized';
    indicator.className = 'status-no';
    icon.textContent = '🔒';
    title.textContent = 'Not authorized';
    desc.textContent = 'No Google account matched the authorized list.';
    detail.textContent = '';
    hint.textContent = 'Make sure you are signed into Gmail in this browser, then click Refresh.';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('refreshBtn').addEventListener('click', refreshAuth);
  updateUI();
});