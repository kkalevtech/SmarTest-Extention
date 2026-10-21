// ── SmarTest background worker ──
// No authentication. The extension is controlled by a single on/off flag
// stored in chrome.storage.local (default: enabled).

const DEFAULT_ENABLED = true;

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get('enabled');
  return typeof enabled === 'boolean' ? enabled : DEFAULT_ENABLED;
}

async function updateBadge(enabled) {
  try {
    await chrome.action.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: enabled ? '#2e7d32' : '#9e9e9e' });
  } catch {}
}

// Set the default state the first time the extension runs.
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get('enabled');
  if (typeof enabled !== 'boolean') {
    await chrome.storage.local.set({ enabled: DEFAULT_ENABLED });
  }
  // Drop leftovers from the old authorization system.
  await chrome.storage.local.remove(['authorized', 'authEmail', 'authMethod', 'authReason', 'authDebug']);
  updateBadge(typeof enabled === 'boolean' ? enabled : DEFAULT_ENABLED);
});

chrome.runtime.onStartup.addListener(async () => {
  updateBadge(await getEnabled());
});

// Keep the toolbar badge in sync with the toggle.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  updateBadge(changes.enabled.newValue !== false);
});

updateBadge(DEFAULT_ENABLED);
getEnabled().then(updateBadge);
