const BACKEND_URL = "http://127.0.0.1:32000/activity";
const DWELL_TIME_MS = 10000; // 10 seconds threshold

let currentDwellTimer = null;
let activeTabId = null;
let activeWindowId = null;

function clearDwellTimer() {
  if (currentDwellTimer) {
    clearTimeout(currentDwellTimer);
    currentDwellTimer = null;
  }
}

async function sendEvent(tab) {
  const event = {
    type: "browser.focus",
    source: "browser",
    timestamp: Date.now(),
    payload: {
      appName: "Chrome",
      windowTitle: tab.title,
      url: tab.url,
      platform: "win32"
    }
  };

  try {
    await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event)
    });
    console.log("Synced with IRIS:", tab.title);
  } catch (err) {
    console.error("Failed to sync with IRIS backend:", err);
  }
}

function handleTabFocus(tab) {
  if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("edge://") || tab.url.startsWith("devtools://")) {
    clearDwellTimer();
    return;
  }

  clearDwellTimer();
  activeTabId = tab.id;
  activeWindowId = tab.windowId;

  currentDwellTimer = setTimeout(() => {
    // Tab has been focused for DWELL_TIME_MS. Confirm it's still active before sending.
    chrome.tabs.get(tab.id, (currentTab) => {
      if (chrome.runtime.lastError || !currentTab) return; // Tab closed
      if (currentTab.active && currentTab.windowId === activeWindowId) {
        chrome.windows.get(activeWindowId, (win) => {
          if (chrome.runtime.lastError || !win) return;
          if (win.focused) {
            sendEvent(currentTab);
          }
        });
      }
    });
  }, DWELL_TIME_MS);
}

// Triggered when you switch to a different tab
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    handleTabFocus(tab);
  } catch (e) {
    console.error(e);
  }
});

// Triggered when the current tab finishes loading a new page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    handleTabFocus(tab);
  }
});

// Triggered when you switch between entirely different Chrome windows
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    clearDwellTimer();
    return;
  }
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId: windowId });
    if (tabs.length > 0) {
      handleTabFocus(tabs[0]);
    }
  } catch (e) {
    console.error(e);
  }
});
