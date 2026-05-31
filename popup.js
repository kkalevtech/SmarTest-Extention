document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const btn = document.getElementById('toggleBtn');
  const statusEl = document.getElementById('status');

  // Get current state from the content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getState' });
    updateUI(response.enabled);
  } catch {
    statusEl.textContent = 'Reload the page';
    statusEl.className = 'status error';
    btn.disabled = true;
    return;
  }

  btn.addEventListener('click', async () => {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'toggle' });
      updateUI(response.enabled);
    } catch {
      statusEl.textContent = 'Error toggling';
      statusEl.className = 'status error';
    }
  });

  function updateUI(enabled) {
    if (enabled) {
      btn.textContent = 'Disable';
      btn.className = 'toggle-btn on';
      statusEl.textContent = 'Active';
      statusEl.className = 'status active';
    } else {
      btn.textContent = 'Enable';
      btn.className = 'toggle-btn off';
      statusEl.textContent = 'Inactive';
      statusEl.className = 'status inactive';
    }
  }
});
