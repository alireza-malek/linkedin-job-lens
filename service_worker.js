chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Routes messages between side panel and content. Also tags content results with tabId
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    // Content -> Panel: only forward results from the currently active tab
    if (msg?.type === 'CONTENT_RESULTS') {
      const senderTabId = sender?.tab?.id;
      // Check if this message is from the currently active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs?.[0]?.id;
        if (senderTabId === activeTabId) {
          // Only send to panel if it's open and listening
          chrome.runtime.sendMessage({ type: 'CONTENT_RESULTS', tabId: senderTabId, data: msg.data }).catch(() => {
            // Panel not open, silently ignore - this is expected behavior
          });
        }
      });
      return; // no sendResponse
    }

    // Panel -> Content: route to active tab in current window
    if (msg?.type === 'PANEL_TO_CONTENT') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        if (tabId) {
          // Include tabId in the payload so content script knows which tab it's for
          const payload = { ...msg.payload, tabId };
          chrome.tabs.sendMessage(tabId, payload);
        }
      });
      return;
    }

    // Get current tab ID for content scripts
    if (msg?.type === 'GET_TAB_ID') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs?.[0]?.id;
        sendResponse({ tabId });
      });
      return true; // async
    }

    // Full list scan stopped notification
    if (msg?.type === 'FULL_LIST_SCAN_STOPPED') {
      chrome.runtime.sendMessage({ type: 'FULL_LIST_SCAN_STOPPED', tabId: msg.tabId }).catch(() => {
        // Panel not open, silently ignore
      });
      return;
    }

    // Storage proxy for the panel
    if (msg?.type === 'STORAGE_GET') {
      chrome.storage.local.get(msg.keys || [], (data) => sendResponse({ data }));
      return true; // async
    }
    if (msg?.type === 'STORAGE_SET') {
      chrome.storage.local.set(msg.data || {}, () => sendResponse({ ok: true }));
      return true; // async
    }

    // Handle UNSAVE_JOB from panel
    if (msg?.type === 'UNSAVE_JOB' && msg.jobId) {
      const STORAGE_KEY = 'jl_job_scan_results';
      chrome.storage.local.get([STORAGE_KEY], (data) => {
        const results = data[STORAGE_KEY] || {};
        delete results[msg.jobId];
        chrome.storage.local.set({ [STORAGE_KEY]: results }, () => {
          sendResponse({ ok: true });
        });
      });
      return true; // async
    }

    // Copy feedback messages from content to panel
    if (msg?.type === 'COPY_SUCCESS' || msg?.type === 'COPY_ERROR') {
      chrome.runtime.sendMessage({ type: msg.type, data: msg.data }).catch(() => {
        // Panel not open, silently ignore
      });
      return;
    }
  } catch (e) {
    console.warn('service_worker message error', e);
  }
});