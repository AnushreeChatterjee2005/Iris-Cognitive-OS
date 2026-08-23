// Background script that sends tab URLs to IRIS Activity Gateway

const GATEWAY_URL = 'http://127.0.0.1:32000/activity';
const TOKEN_URL = 'http://127.0.0.1:32000/session-token';
const SOURCE_NAME = 'browser';
let launchToken = '';

async function getLaunchToken() {
  if (launchToken) return launchToken;
  const response = await fetch(TOKEN_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`IRIS token endpoint returned ${response.status}`);
  const data = await response.json();
  launchToken = typeof data.token === 'string' ? data.token : '';
  if (!launchToken) throw new Error('IRIS launch token was empty');
  return launchToken;
}

// Send activity to the local gateway
async function sendActivity(tab) {
  if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('edge://')) return;

  try {
    const token = await getLaunchToken();
    const payload = {
      type: 'browser.navigation',
      source: SOURCE_NAME,
      payload: {
        url: tab.url,
        title: tab.title || 'Chrome',
        domain: new URL(tab.url).hostname,
        browser: 'chrome',
        tabId: String(tab.id ?? '')
      }
    };

    await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-IRIS-Token': token },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    launchToken = '';
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
