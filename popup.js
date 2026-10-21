const DEFAULT_ENABLED = true;

const toggleBtn = document.getElementById('toggleBtn');
const indicator = document.getElementById('statusIndicator');

function isEnabled(value) {
  return typeof value === 'boolean' ? value : DEFAULT_ENABLED;
}

function render(enabled) {
  toggleBtn.classList.toggle('on', enabled);
  toggleBtn.setAttribute('aria-checked', String(enabled));

  indicator.textContent = enabled ? 'Protection is ON' : 'Protection is OFF';
  indicator.className = enabled ? 'status status-ok' : 'status status-off';
}

async function loadState() {
  const { enabled } = await chrome.storage.local.get('enabled');
  render(isEnabled(enabled));
}

async function toggle() {
  const { enabled } = await chrome.storage.local.get('enabled');
  const next = !isEnabled(enabled);
  // Content scripts in every open tab react to this change immediately.
  await chrome.storage.local.set({ enabled: next });
  render(next);
}

document.addEventListener('DOMContentLoaded', () => {
  toggleBtn.addEventListener('click', toggle);

  // Reflect changes made from other tabs / popups.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enabled) return;
    render(isEnabled(changes.enabled.newValue));
  });

  loadState();
});
