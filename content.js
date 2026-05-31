// Inject the blocking script into the page context (content scripts run in isolated world)
// Using src= instead of textContent to comply with page CSP (no inline execution)
const script = document.createElement('script');
script.src = chrome.runtime.getURL('blocker.js');
script.onload = () => script.remove();
document.documentElement.appendChild(script);

// Listen for toggle messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const port = document.getElementById('lwys-ctv-port');
  if (port) {
    if (message.action === 'toggle') {
      const newState = port.dataset.enabled === 'true' ? 'false' : 'true';
      port.dataset.enabled = newState;
      sendResponse({ enabled: newState === 'true' });
    } else if (message.action === 'getState') {
      sendResponse({ enabled: port.dataset.enabled === 'true' });
    }
  } else {
    sendResponse({ enabled: false, error: 'port not found' });
  }
  return true; // keep the message channel open for async response
});
