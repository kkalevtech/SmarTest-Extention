// ── SmarTest content script ──
//
// No authentication. Every page simply follows the on/off flag stored in
// chrome.storage.local. All open tabs are kept in sync via storage.onChanged.

const DEFAULT_ENABLED = true;

let injected = false;

function isEnabled(value) {
  return typeof value === 'boolean' ? value : DEFAULT_ENABLED;
}

async function getEnabled() {
  const { enabled } = await chrome.storage.local.get('enabled');
  return isEnabled(enabled);
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

async function init() {
  if (await getEnabled()) injectBlocker(true);
}

// React to the popup toggle in every open tab, no reload required.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.enabled) return;
  const enabled = isEnabled(changes.enabled.newValue);
  if (enabled) {
    injectBlocker(true);
  } else {
    setBlockerEnabled(false);
  }
});

init();
