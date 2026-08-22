// Background script that sends tab URLs to IRIS Activity Gateway

const GATEWAY_URL = 'http://127.0.0.1:32000/activity';
const SOURCE_NAME = 'chrome-extension';

// Send activity to the local gateway
async function sendActivity(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  try {
    const payload = {
      type: 'app.switch',
      source: SOURCE_NAME,
      payload: {
        appName: 'chrome',
        windowTitle: tab.title || 'Chrome',
        url: tab.url,
        platform: 'win32'
      }
    };

    await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Gateway might be offline, ignore silently
  }
}

// Listen to tab switching
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    sendActivity(tab);
  } catch (e) {}
});

// Listen to URL updates in the current tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    sendActivity(tab);
  }
});
