function sendToContent(type, payload, callback) {
  // Get current tab ID and include it in the message
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    chrome.runtime.sendMessage({
      type: 'PANEL_TO_CONTENT',
      payload: { type, ...payload, tabId }
    }, (response) => {
      if (callback) callback(response);
    });
  });
}

const summaryEl = document.getElementById('summary');
const matchListEl = document.getElementById('matchList');
const rescanBtn = document.getElementById('rescan');
const fullListScanBtn = document.getElementById('fullListScan');
const visaKwInput = document.getElementById('visaKwInput');
const addVisaKwBtn = document.getElementById('addVisaKw');
const visaKwChips = document.getElementById('visaKwChips');
const customKwInput = document.getElementById('customKwInput');
const addCustomKwBtn = document.getElementById('addCustomKw');
const customKwChips = document.getElementById('customKwChips');
const copyBtn = document.getElementById('copyJD');
const jobTitleContainer = document.getElementById('jobTitleContainer');
const jobTitleDisplay = document.getElementById('jobTitleDisplay');
const companyNameDisplay = document.getElementById('companyNameDisplay');
const locationDisplay = document.getElementById('locationDisplay');
const locationText = document.getElementById('locationText');
const jobMetaDot = document.getElementById('jobMetaDot');
let filterVisaEnabled = false;
let filterMatchesEnabled = false;
let currentSearchTerm = '';
let currentSort = 'latest'; // 'latest', 'earliest', 'most-matches'

const savedJobsListEl = document.getElementById('savedJobsList');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const menuBtn = document.getElementById('menuBtn');
const menuDropdown = document.getElementById('menuDropdown');
const exportJobsBtn = document.getElementById('exportJobs');
const importJobsBtn = document.getElementById('importJobs');
const importFileInput = document.getElementById('importFileInput');
const searchBtn = document.getElementById('searchBtn');
const searchInput = document.getElementById('searchInput');
const filterBtn = document.getElementById('filterBtn');
const filterDropdown = document.getElementById('filterDropdown');
const filterVisaOption = document.getElementById('filterVisaOption');
const filterMatchesOption = document.getElementById('filterMatchesOption');
const sortBtn = document.getElementById('sortBtn');
const sortDropdown = document.getElementById('sortDropdown');
const sortLatestOption = document.getElementById('sortLatestOption');
const sortEarliestOption = document.getElementById('sortEarliestOption');
const sortMostMatchesOption = document.getElementById('sortMostMatchesOption');

// ============================================
// AI Insight, Templates & Settings DOM Elements
// ============================================
const mainView = document.getElementById('mainView');
const templatesView = document.getElementById('templatesView');
const settingsView = document.getElementById('settingsView');
const templatesNavBtn = document.getElementById('templatesNavBtn');
const settingsNavBtn = document.getElementById('settingsNavBtn');
const templatesBackBtn = document.getElementById('templatesBackBtn');
const settingsBackBtn = document.getElementById('settingsBackBtn');

// Scan Tab AI Controls
const autoAiCheckbox = document.getElementById('autoAiCheckbox');
const autoAiToggleBtn = document.getElementById('autoAiToggleBtn');
const aiInsightSection = document.getElementById('aiInsightSection');
const runInsightBtn = document.getElementById('runInsightBtn');
const runInsightBtnText = document.getElementById('runInsightBtnText');
const templateSelectBtn = document.getElementById('templateSelectBtn');
const templateMenuBtn = document.getElementById('templateMenuBtn');
const templateActionDropdown = document.getElementById('templateActionDropdown');
const copyPromptBtn = document.getElementById('copyPromptBtn');
const activeTemplateNameDisplay = document.getElementById('activeTemplateNameDisplay');
const templateChevronIcon = document.getElementById('templateChevronIcon');
const templateDropdownMenu = document.getElementById('templateDropdownMenu');
const toggleAskBtn = document.getElementById('toggleAskBtn');
const askAnythingBox = document.getElementById('askAnythingBox');
const askQueryInput = document.getElementById('askQueryInput');
const submitAskBtn = document.getElementById('submitAskBtn');
const cancelAskBtn = document.getElementById('cancelAskBtn');
const slotLimitNotice = document.getElementById('slotLimitNotice');
const aiSlotsContainer = document.getElementById('aiSlotsContainer');

// Templates View & Editor Modal Elements
const newTemplateBtn = document.getElementById('newTemplateBtn');
const templatesListEl = document.getElementById('templatesList');
const templateEditorOverlay = document.getElementById('templateEditorOverlay');
const templateEditorTitle = document.getElementById('templateEditorTitle');
const closeTemplateEditorBtn = document.getElementById('closeTemplateEditorBtn');
const templateNameInput = document.getElementById('templateNameInput');
const templateContextInput = document.getElementById('templateContextInput');
const criteriaEditorList = document.getElementById('criteriaEditorList');
const addCriterionBtn = document.getElementById('addCriterionBtn');
const saveTemplateBtn = document.getElementById('saveTemplateBtn');
const cancelTemplateBtn = document.getElementById('cancelTemplateBtn');

// Confirmation Modal Elements
const confirmationModalOverlay = document.getElementById('confirmationModalOverlay');
const confirmationModalTitle = document.getElementById('confirmationModalTitle');
const confirmationModalMessage = document.getElementById('confirmationModalMessage');
const closeConfirmationModalBtn = document.getElementById('closeConfirmationModalBtn');
const confirmActionBtn = document.getElementById('confirmActionBtn');
const cancelActionBtn = document.getElementById('cancelActionBtn');

// Track open accordions in saved jobs list
const openSavedJobAccordions = new Set();

// Settings View Elements
const exportSettingsBtn = document.getElementById('exportSettingsBtn');
const importSettingsBtn = document.getElementById('importSettingsBtn');
const importSettingsInput = document.getElementById('importSettingsInput');
const aiBaseUrlInput = document.getElementById('aiBaseUrl');
const aiApiKeyInput = document.getElementById('aiApiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKeyBtn');
const aiModelInput = document.getElementById('aiModelInput');
const aiModelsDatalist = document.getElementById('aiModelsDatalist');
const refreshModelsBtn = document.getElementById('refreshModelsBtn');
const modelsDiscoveryStatus = document.getElementById('modelsDiscoveryStatus');
const aiTemperatureInput = document.getElementById('aiTemperatureInput');
const aiMaxTokensInput = document.getElementById('aiMaxTokensInput');
const aiReasoningEffortInput = document.getElementById('aiReasoningEffortInput');
const aiSystemInstructionInput = document.getElementById('aiSystemInstruction');
const testAiConnectionBtn = document.getElementById('testAiConnectionBtn');
const saveAiSettingsBtn = document.getElementById('saveAiSettingsBtn');
const aiSettingsStatus = document.getElementById('aiSettingsStatus');
const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
const updateStatusMessage = document.getElementById('updateStatusMessage');

// Storage keys
const STORAGE_KEY_AI_SETTINGS = 'jl_ai_settings';
const STORAGE_KEY_TEMPLATES = 'jl_insight_templates';
const STORAGE_KEY_ACTIVE_TEMPLATE = 'jl_active_template_id';
const STORAGE_KEY_JOB_RESULTS = 'jl_job_scan_results';
const MAX_STORED_JOBS = 3000;

// Storage access helpers (prefer direct chrome.storage.local for persistence reliability)
function getStorageData(keys, cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(keys, (data) => {
      if (chrome.runtime?.lastError) {
        console.warn('getStorageData error:', chrome.runtime.lastError);
      }
      cb(data || {});
    });
  } else {
    chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys }, (resp) => cb((resp && resp.data) || {}));
  }
}

function setStorageData(data, cb) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime?.lastError) {
        console.warn('setStorageData error:', chrome.runtime.lastError);
      }
      if (cb) cb();
    });
  } else {
    chrome.runtime.sendMessage({ type: 'STORAGE_SET', data }, () => { if (cb) cb(); });
  }
}

// State variables for AI and templates
let aiSettings = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: '',
  systemInstruction: '',
  temperature: 0.3,
  maxTokens: '',
  reasoningEffort: '',
  autoInsight: false
};
let insightTemplates = [];
let activeTemplateId = null;
let editingTemplateId = null;
let currentJobDetails = null;
let autoInsightDebounceTimer = null;


let isFullListScanning = false;
let scanTimeoutId = null; // To track the delayed scanning message

// Notification system for user feedback
function showNotification(message, type = 'info', duration = 3000) {
  // Remove existing notification
  const existing = document.querySelector('.jl-notification');
  if (existing) existing.remove();

  const notification = document.createElement('div');
  notification.className = `jl-notification jl-notification--${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    z-index: 10000;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: slideIn 0.3s ease-out;
  `;

  // Color based on type
  switch (type) {
    case 'success':
      notification.style.background = '#dcfce7';
      notification.style.color = '#166534';
      notification.style.border = '1px solid #86efac';
      break;
    case 'error':
      notification.style.background = '#fef2f2';
      notification.style.color = '#991b1b';
      notification.style.border = '1px solid #fca5a5';
      break;
    default:
      notification.style.background = '#f3f4f6';
      notification.style.color = '#374151';
      notification.style.border = '1px solid #d1d5db';
  }

  document.body.appendChild(notification);

  // Auto remove after duration
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => notification.remove(), 300);
  }, duration);
}

// Add notification CSS animations to the panel HTML
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Mirror defaults in panel so we can seed chips when storage empty
const DEFAULT_VISA_KEYWORDS = [
  'visa', 'sponsorship', 'work permit',
  'employment visa', 'h1b', 'h-1b',
  'relocation', 'relocate', 'sponsor', 'sponsored', 'sponsoring', 'sponsorable',
  'blue card', 'immigration',
];

let visaKeywords = [];
let customKeywords = [];
let currentTabId = null;
let currentTabUrl = null;
let currentJobId = null;
let currentJobTitle = null;

// Helper functions for delayed scanning message
function clearScanTimeout() {
  if (scanTimeoutId) {
    clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
  }
}

function startScanTimeout() {
  clearScanTimeout();
  scanTimeoutId = setTimeout(() => {
    if (isJobsHomePage(currentTabUrl)) {
      summaryEl.textContent = 'Open a job posting to scan...';
      return;
    }
    // Only show if still in the scanning state
    if (summaryEl.textContent.includes('Scanning job description')) {
      summaryEl.innerHTML = 'Scanning job description and badges...<div style="margin-top: 6px; font-weight: 400;">If it takes longer than expected, reload the page.</div>';
    }
  }, 10000);
}

// Extract job ID from URL - handles both patterns:
// 1. /jobs/view/123456 (full page view)
// 2. currentJobId=123456 (two-pane view)
function extractJobIdFromUrl(url = '') {
  if (!url) return null;
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return viewMatch[1];
  const currentJobIdMatch = url.match(/[?&]currentJobId=(\d+)/);
  if (currentJobIdMatch) return currentJobIdMatch[1];
  return null;
}

// Immediate cache restore when reopening browser or navigating to an already scanned job
function checkAndRestoreCachedJob(tabUrl) {
  const jobId = extractJobIdFromUrl(tabUrl);
  if (!jobId) return;

  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const savedJobs = data[STORAGE_KEY_JOB_RESULTS] || {};
    const cachedJob = savedJobs[jobId];
    if (cachedJob) {
      currentJobId = jobId;
      currentJobTitle = cachedJob.jobTitle || null;
      currentJobDetails = {
        jobId: jobId,
        jobTitle: cachedJob.jobTitle,
        companyName: cachedJob.companyName,
        location: cachedJob.location || null,
        description: cachedJob.description || ''
      };

      renderMatches({
        hasJD: true,
        visaMatches: cachedJob.visaMatches || [],
        customMatches: cachedJob.customMatches || [],
        jobTitle: cachedJob.jobTitle,
        companyName: cachedJob.companyName,
        location: cachedJob.location || null,
        jobId: jobId
      });

      // Clear the "Scanning..." message since we have rendered the cached scan
      clearScanTimeout();
    }
  });
}

// Determine current tab id and URL for filtering incoming results
function updateActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs?.[0];
    currentTabId = tab?.id || null;
    currentTabUrl = tab?.url || null;
    if (cb) cb();
  });
}

updateActiveTab(() => {
  renderCurrentTabState();
  if (isLinkedInTab() && isJobPage() && !isJobsHomePage(currentTabUrl)) {
    checkAndRestoreCachedJob(currentTabUrl);
    setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
  }
});

chrome.tabs.onActivated.addListener(() => {
  updateActiveTab(() => {
    renderCurrentTabState();
    if (isLinkedInTab() && isJobPage() && !isJobsHomePage(currentTabUrl)) {
      checkAndRestoreCachedJob(currentTabUrl);
      setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && tabId === currentTabId) {
    updateActiveTab(() => {
      renderCurrentTabState();
      if (isLinkedInTab() && isJobPage() && !isJobsHomePage(currentTabUrl)) {
        checkAndRestoreCachedJob(currentTabUrl);
        setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
      }
    });
  }
});

// Load saved keywords, seed with defaults if empty
getStorageData(['visaKeywords', 'customKeywords', STORAGE_KEY_AI_SETTINGS, STORAGE_KEY_TEMPLATES, STORAGE_KEY_ACTIVE_TEMPLATE], (data) => {
  const loadedVisa = Array.isArray(data.visaKeywords) ? data.visaKeywords : [];
  const loadedCustom = Array.isArray(data.customKeywords) ? data.customKeywords : [];
  visaKeywords = loadedVisa.length ? loadedVisa : DEFAULT_VISA_KEYWORDS.slice();
  customKeywords = loadedCustom;
  renderKeywords();

  // Load AI Settings and Templates
  if (data[STORAGE_KEY_AI_SETTINGS]) {
    aiSettings = { ...aiSettings, ...data[STORAGE_KEY_AI_SETTINGS] };
  }
  if (autoAiCheckbox) {
    autoAiCheckbox.checked = !!aiSettings.autoInsight;
    if (autoAiToggleBtn) {
      autoAiToggleBtn.classList.toggle('checked', !!aiSettings.autoInsight);
    }
  }

  if (Array.isArray(data[STORAGE_KEY_TEMPLATES]) && data[STORAGE_KEY_TEMPLATES].length > 0) {
    insightTemplates = data[STORAGE_KEY_TEMPLATES];
  } else {
    insightTemplates = [];
  }

  activeTemplateId = data[STORAGE_KEY_ACTIVE_TEMPLATE] || (insightTemplates[0] ? insightTemplates[0].id : null);
  if (!insightTemplates.some((t) => t.id === activeTemplateId)) {
    activeTemplateId = insightTemplates[0] ? insightTemplates[0].id : null;
  }
  updateActiveTemplateUI();
});

function persistKeywords() {
  setStorageData({ visaKeywords, customKeywords }, () => {
    sendToContent('REQUEST_SCAN', {});
  });
}

// Check if current tab is LinkedIn
function isLinkedInTab() {
  return currentTabUrl && currentTabUrl.includes('linkedin.com');
}

// Check if current tab is a job-related page
function isJobPage() {
  if (!currentTabUrl) return false;
  const url = currentTabUrl.toLowerCase();
  return url.includes('/jobs/') ||
    url.includes('/job/') ||
    url.includes('/jobs?') ||
    url.includes('/search/jobs') ||
    url.includes('/jobs/search') ||
    url.includes('/jobs/search-results') ||
    url.includes('/jobs/collections');
}

// Check if current tab is specifically the LinkedIn Jobs landing/hub page (no specific job open)
function isJobsHomePage(urlStr = '') {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    const path = url.pathname.toLowerCase().replace(/\/+$/, '');
    if (path === '/jobs') {
      const hasJobId = url.searchParams.has('currentJobId') && !!url.searchParams.get('currentJobId');
      return !hasJobId;
    }
    return false;
  } catch (e) {
    const clean = urlStr.split('?')[0].split('#')[0].replace(/\/+$/, '').toLowerCase();
    return clean.endsWith('/jobs') && !urlStr.includes('currentJobId=');
  }
}

// Clear any displayed results
function clearResults() {
  summaryEl.textContent = '';
  summaryEl.style.display = '';
  matchListEl.innerHTML = '';
  if (copyBtn) copyBtn.classList.add('search-input-hidden');
  if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
  if (companyNameDisplay) {
    companyNameDisplay.textContent = '';
    companyNameDisplay.classList.add('search-input-hidden');
  }
  if (locationDisplay) locationDisplay.classList.add('search-input-hidden');
  if (locationText) locationText.textContent = '';
  if (jobMetaDot) jobMetaDot.classList.add('search-input-hidden');
  if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
  currentJobDetails = null;
}

// Render appropriate content based on current tab
function renderCurrentTabState() {
  const isLinkedIn = isLinkedInTab();
  const isJob = isJobPage();

  // Enable/disable rescan button
  rescanBtn.disabled = !isLinkedIn;

  // Enable/disable full list scan button
  fullListScanBtn.disabled = !isLinkedIn || !isJob;
  if (!isLinkedIn || !isJob) {
    fullListScanBtn.style.opacity = '0.5';
  } else {
    fullListScanBtn.style.opacity = '1';
  }

  if (!isLinkedIn) {
    // Not on LinkedIn
    clearScanTimeout();
    summaryEl.style.display = '';
    summaryEl.innerHTML = 'Navigate to <a href="https://www.linkedin.com/jobs/" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">LinkedIn Jobs</a> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 1px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> to use this tool';
    matchListEl.innerHTML = '';
    if (copyBtn) copyBtn.classList.add('search-input-hidden');
    if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
    if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
    return;
  }

  if (!isJob) {
    // On LinkedIn but not on job pages
    clearScanTimeout();
    summaryEl.style.display = '';
    summaryEl.textContent = 'Navigate to job listings or job details to scan';
    matchListEl.innerHTML = '';
    if (copyBtn) copyBtn.classList.add('search-input-hidden');
    if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
    if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
    return;
  }

  // Specifically on LinkedIn Jobs landing page (https://www.linkedin.com/jobs/) without an open job
  if (isJobsHomePage(currentTabUrl)) {
    clearScanTimeout();
    summaryEl.style.display = '';
    summaryEl.textContent = 'Open a job posting to scan...';
    matchListEl.innerHTML = '';
    if (copyBtn) copyBtn.classList.add('search-input-hidden');
    if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
    if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
    return;
  }

  // On LinkedIn job page - show scanning state until results arrive
  summaryEl.style.display = '';
  summaryEl.textContent = 'Scanning job description and badges...';
  matchListEl.innerHTML = '';
  if (copyBtn) copyBtn.classList.add('search-input-hidden');
  if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
  startScanTimeout();
}

function renderKeywords() {
  visaKwChips.innerHTML = '';
  visaKeywords.forEach((k, idx) => {
    const chip = document.createElement('span');
    chip.className = 'kw-chip';
    const label = document.createElement('span');
    label.textContent = k;
    const x = document.createElement('span');
    x.className = 'kw-x';
    x.textContent = '×';
    x.title = 'Remove';
    x.addEventListener('click', () => {
      visaKeywords.splice(idx, 1);
      renderKeywords();
      persistKeywords();
    });
    chip.appendChild(label);
    chip.appendChild(x);
    visaKwChips.appendChild(chip);
  });

  customKwChips.innerHTML = '';
  customKeywords.forEach((k, idx) => {
    const chip = document.createElement('span');
    chip.className = 'kw-chip';
    const label = document.createElement('span');
    label.textContent = k;
    const x = document.createElement('span');
    x.className = 'kw-x';
    x.textContent = '×';
    x.title = 'Remove';
    x.addEventListener('click', () => {
      customKeywords.splice(idx, 1);
      renderKeywords();
      persistKeywords();
    });
    chip.appendChild(label);
    chip.appendChild(x);
    customKwChips.appendChild(chip);
  });

  // Update keyword counts in headers
  const visaCountEl = document.querySelector('[data-toggle="visa"] .kw-count');
  const customCountEl = document.querySelector('[data-toggle="custom"] .kw-count');

  if (visaCountEl) {
    visaCountEl.textContent = `(${visaKeywords.length})`;
  } else {
    const visaHeader = document.querySelector('[data-toggle="visa"]');
    if (visaHeader) {
      const countSpan = document.createElement('span');
      countSpan.className = 'kw-count';
      countSpan.textContent = `(${visaKeywords.length})`;
      countSpan.style.marginLeft = '8px';
      countSpan.style.color = '#6b7280';
      countSpan.style.fontWeight = '400';
      visaHeader.querySelector('.kw-section-title').appendChild(countSpan);
    }
  }

  if (customCountEl) {
    customCountEl.textContent = `(${customKeywords.length})`;
  } else {
    const customHeader = document.querySelector('[data-toggle="custom"]');
    if (customHeader) {
      const countSpan = document.createElement('span');
      countSpan.className = 'kw-count';
      countSpan.textContent = `(${customKeywords.length})`;
      countSpan.style.marginLeft = '8px';
      countSpan.style.color = '#6b7280';
      countSpan.style.fontWeight = '400';
      customHeader.querySelector('.kw-section-title').appendChild(countSpan);
    }
  }
}

addVisaKwBtn.addEventListener('click', () => {
  const raw = (visaKwInput.value || '').trim();
  if (!raw) return;
  const tokens = raw.split(/\n|,/).map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return;

  tokens.forEach(token => {
    const t = token.toLowerCase();
    if (t && !visaKeywords.includes(t)) {
      visaKeywords.push(t);
    }
  });
  visaKwInput.value = '';
  renderKeywords();
  persistKeywords();
});

addCustomKwBtn.addEventListener('click', () => {
  const raw = (customKwInput.value || '').trim();
  if (!raw) return;
  const tokens = raw.split(/\n|,/).map(s => s.trim()).filter(Boolean);
  if (tokens.length === 0) return;

  tokens.forEach(token => {
    const t = token.toLowerCase();
    if (t && !customKeywords.includes(t)) {
      customKeywords.push(t);
    }
  });
  customKwInput.value = '';
  renderKeywords();
  persistKeywords();
});

rescanBtn.addEventListener('click', () => {
  if (isLinkedInTab()) {
    if (isJobsHomePage(currentTabUrl)) {
      clearScanTimeout();
      summaryEl.style.display = '';
      summaryEl.textContent = 'Open a job posting to scan...';
      matchListEl.innerHTML = '';
      if (copyBtn) copyBtn.classList.add('search-input-hidden');
      if (jobTitleContainer) jobTitleContainer.classList.add('search-input-hidden');
      if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
      return;
    }
    summaryEl.textContent = 'Scanning job description and badges...';
    startScanTimeout();
    sendToContent('REQUEST_SCAN', {});
  }
});

fullListScanBtn.addEventListener('click', () => {
  if (!isLinkedInTab() || !isJobPage()) {
    showNotification('Please navigate to LinkedIn job listings', 'error');
    return;
  }

  if (isFullListScanning) {
    // Stop scanning
    sendToContent('STOP_FULL_LIST_SCAN', {});
    isFullListScanning = false;
    fullListScanBtn.textContent = 'Start Auto-Scan List';
    fullListScanBtn.style.background = '#3b82f6';
    showNotification('Stopped scanning', 'info');
  } else {
    // Start scanning
    sendToContent('START_FULL_LIST_SCAN', {});
    isFullListScanning = true;
    fullListScanBtn.textContent = 'Stop Auto-Scan List';
    fullListScanBtn.style.background = '#ef4444';
    showNotification('Started scanning list...', 'info');
  }
});

// Tab navigation
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;

    // Update active tab button
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update active tab content
    tabContents.forEach(content => content.classList.remove('active'));
    document.getElementById(`${tabName}Tab`).classList.add('active');

    // Load saved jobs if switching to saved tab
    if (tabName === 'saved') {
      loadSavedJobs();
      // Hide search input when switching to saved tab if it's empty
      if (!searchInput.value.trim()) {
        searchInput.classList.remove('visible');
        searchInput.classList.add('search-input-hidden');
        currentSearchTerm = '';
      }
    }
  });
});

// Old filter button handlers removed - now using dropdown checkboxes

copyBtn.addEventListener('click', () => {
  sendToContent('COPY_JOB_DESCRIPTION', {});
});

// Toggle keyword sections (using event delegation to avoid CSP issues)
document.addEventListener('click', (e) => {
  const header = e.target.closest('.kw-box-header');
  if (header && header.dataset.toggle) {
    e.stopPropagation();
    const type = header.dataset.toggle;
    const content = document.getElementById(`${type}KwContent`);
    const toggle = document.getElementById(`${type}Toggle`);
    if (content && toggle) {
      const isExpanded = !content.classList.contains('search-input-hidden');
      if (isExpanded) {
        content.classList.add('search-input-hidden');
        toggle.textContent = '▶';
        toggle.style.transform = 'rotate(0deg)';
      } else {
        content.classList.remove('search-input-hidden');
        toggle.textContent = '▼';
        toggle.style.transform = 'rotate(0deg)';
      }
    }
  }
});

// Receive scan results; only render for this tab
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg !== 'object') return;

  if (msg.type === 'CONTENT_RESULTS' && msg.data) {
    // Strict check: only accept messages for the current active tab
    if (!msg.tabId || !currentTabId || msg.tabId !== currentTabId) return;
    // Additional safety: only show results if we're currently on a LinkedIn job page
    if (!isLinkedInTab() || !isJobPage()) return;

    currentJobId = msg.data.jobId || null;
    currentJobTitle = msg.data.jobTitle || null;

    currentJobDetails = {
      jobId: msg.data.jobId,
      jobTitle: msg.data.jobTitle,
      companyName: msg.data.companyName,
      location: msg.data.location || null,
      description: msg.data.description || ''
    };

    renderMatches(msg.data);

    // Always refresh scanned jobs list when a new scan completes
    loadSavedJobs();

    // Trigger auto-insight if configured
    if (aiSettings.autoInsight && !isFullListScanning && msg.data.hasJD) {
      clearTimeout(autoInsightDebounceTimer);
      autoInsightDebounceTimer = setTimeout(() => {
        triggerAutoInsightIfEligible();
      }, 800);
    }
  }

  // Handle copy feedback
  if (msg.type === 'COPY_SUCCESS' && msg.data) {
    const chars = msg.data.length;
    showNotification(`✅ Copied ${chars} characters to clipboard`, 'success');
    const copyText = copyBtn ? copyBtn.querySelector('.copy-jd-btn-text') : null;
    if (copyText) {
      copyText.innerHTML = '<span>Copied!</span>';
      setTimeout(() => {
        copyText.innerHTML = '<span>Copy Job</span><span>Description</span>';
      }, 1500);
    }
  }

  if (msg.type === 'COPY_ERROR' && msg.data) {
    showNotification(`❌ Copy failed: ${msg.data.error}`, 'error', 5000);
  }

  // Handle full list scan stopped
  if (msg.type === 'FULL_LIST_SCAN_STOPPED') {
    isFullListScanning = false;
    fullListScanBtn.textContent = 'Start Scan List';
    fullListScanBtn.style.background = '#3b82f6';
    showNotification('Finished scanning all jobs', 'success');
  }
});

function renderMatches({ hasJD, visaMatches = [], customMatches = [], jobTitle = null, companyName = null, location = null, jobId = null }) {
  // Clear the "Scanning..." timeout since results have arrived
  clearScanTimeout();

  if (hasJD) {
    if (copyBtn) copyBtn.classList.remove('search-input-hidden');
    if (aiInsightSection) {
      aiInsightSection.classList.remove('search-input-hidden');
      if (jobId || currentJobId) {
        loadAISlotsForCurrentJob(jobId || currentJobId, (slots) => {
          renderAISlots(slots);
        });
      }
    }
  } else {
    if (copyBtn) copyBtn.classList.add('search-input-hidden');
    if (aiInsightSection) aiInsightSection.classList.add('search-input-hidden');
  }

  // Show/hide job details header card (title, company, location, copy button)
  if (hasJD) {
    jobTitleContainer.classList.remove('search-input-hidden');
    jobTitleDisplay.textContent = jobTitle || 'Job Details';

    if (companyNameDisplay) {
      companyNameDisplay.textContent = companyName || 'Unknown Company';
      companyNameDisplay.classList.remove('search-input-hidden');
    }

    if (location && location.trim()) {
      if (locationText) locationText.textContent = location.trim();
      if (locationDisplay) locationDisplay.classList.remove('search-input-hidden');
      if (jobMetaDot && companyName) jobMetaDot.classList.remove('search-input-hidden');
      else if (jobMetaDot) jobMetaDot.classList.add('search-input-hidden');
    } else {
      if (locationDisplay) locationDisplay.classList.add('search-input-hidden');
      if (jobMetaDot) jobMetaDot.classList.add('search-input-hidden');
    }
  } else {
    jobTitleContainer.classList.add('search-input-hidden');
    if (companyNameDisplay) {
      companyNameDisplay.textContent = '';
      companyNameDisplay.classList.add('search-input-hidden');
    }
    if (locationDisplay) locationDisplay.classList.add('search-input-hidden');
    if (jobMetaDot) jobMetaDot.classList.add('search-input-hidden');
  }

  const visaTotal = visaMatches.reduce((sum, m) => sum + m.count, 0);
  const customTotal = customMatches.reduce((sum, m) => sum + m.count, 0);

  // Hide the old text summary since badges are rendered inside the Keywords Found box
  summaryEl.textContent = '';
  summaryEl.style.display = 'none';
  matchListEl.innerHTML = '';

  // Build keyword lists with anchors for scrolling
  const customKeywordsList = [];
  customMatches.forEach(m => {
    for (let i = 0; i < m.count; i++) {
      const anchorId = m.anchors && m.anchors[i] ? m.anchors[i] : null;
      customKeywordsList.push({ keyword: m.key, anchorId });
    }
  });

  const visaKeywordsList = [];
  visaMatches.forEach(m => {
    for (let i = 0; i < m.count; i++) {
      const anchorId = m.anchors && m.anchors[i] ? m.anchors[i] : null;
      visaKeywordsList.push({ keyword: m.key, anchorId });
    }
  });

  // Create consistent banner-like UI with badges inside the Keywords Found box
  const banner = window.JobLensUI.createKeywordsCardElement({
    visaTotal,
    customTotal,
    visaKeywordsList,
    customKeywordsList,
    onScrollToMatch: (anchorId) => {
      sendToContent('SCROLL_TO_MATCH', { anchorId });
    }
  });
  matchListEl.appendChild(banner);
}

function updateTotalSavedJobsMenu(savedJobs) {
  const menuTotalEl = document.getElementById('menuTotalSavedJobs');
  if (!menuTotalEl) return;

  if (savedJobs && typeof savedJobs === 'object') {
    const count = Object.keys(savedJobs).length;
    menuTotalEl.textContent = `Total saved: ${count}/${MAX_STORED_JOBS} jobs`;
  } else {
    getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
      const jobs = data[STORAGE_KEY_JOB_RESULTS] || {};
      const count = Object.keys(jobs).length;
      menuTotalEl.textContent = `Total saved: ${count}/${MAX_STORED_JOBS} jobs`;
    });
  }
}

function loadSavedJobs() {
  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const savedJobs = data[STORAGE_KEY_JOB_RESULTS] || {};
    renderSavedJobs(savedJobs);
  });
}

function renderSavedJobs(savedJobs) {
  updateTotalSavedJobsMenu(savedJobs);
  savedJobsListEl.innerHTML = '';

  let jobs = Object.entries(savedJobs);
  if (jobs.length === 0) {
    savedJobsListEl.innerHTML = '<div class="muted" style="padding: 32px; text-align: center;">No scanned jobs yet.<br>Jobs will appear here automatically after scanning.</div>';
    return;
  }

  // Sort based on currentSort setting
  jobs.sort((a, b) => {
    const jobA = a[1];
    const jobB = b[1];

    switch (currentSort) {
      case 'latest':
        return (jobB.scannedAt || 0) - (jobA.scannedAt || 0);
      case 'earliest':
        return (jobA.scannedAt || 0) - (jobB.scannedAt || 0);
      case 'most-matches':
        const matchesA = (jobA.customMatches || []).reduce((sum, m) => sum + m.count, 0);
        const matchesB = (jobB.customMatches || []).reduce((sum, m) => sum + m.count, 0);
        return matchesB - matchesA;
      default:
        return (jobB.scannedAt || 0) - (jobA.scannedAt || 0);
    }
  });

  // Apply search filter
  if (currentSearchTerm) {
    jobs = jobs.filter(([jobId, job]) => {
      const jobTitle = (job.jobTitle || '').toLowerCase();
      const companyName = (job.companyName || '').toLowerCase();
      return jobTitle.includes(currentSearchTerm) || companyName.includes(currentSearchTerm);
    });
  }

  // Show message if no jobs match search
  if (jobs.length === 0 && currentSearchTerm) {
    savedJobsListEl.innerHTML = `<div class="muted" style="padding: 32px; text-align: center;">No jobs match "${escapeHtml(currentSearchTerm)}".<br>Try a different search term.</div>`;
    return;
  }

  jobs.forEach(([jobId, job]) => {
    const visaMatchCount = (job.visaMatches || []).reduce((sum, m) => sum + m.count, 0);
    const customMatchCount = (job.customMatches || []).reduce((sum, m) => sum + m.count, 0);
    const aiInsights = Array.isArray(job.aiInsights) ? job.aiInsights : [];

    // Apply filters: "only" means show ONLY jobs with matches
    if (filterVisaEnabled && visaMatchCount === 0) return;
    if (filterMatchesEnabled && customMatchCount === 0) return;

    const card = document.createElement('div');
    card.className = 'saved-job-card';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.alignItems = 'center';
    topRow.style.justifyContent = 'space-between';
    topRow.style.gap = '8px';

    const titleLink = document.createElement('a');
    titleLink.href = `https://www.linkedin.com/jobs/view/${jobId}/`;
    titleLink.target = '_blank';
    titleLink.textContent = job.jobTitle || `Job #${jobId}`;
    titleLink.style.fontWeight = '500';
    titleLink.style.color = '#2563eb';
    titleLink.style.textDecoration = 'none';
    titleLink.style.fontSize = '13px';
    titleLink.style.overflow = 'hidden';
    titleLink.style.textOverflow = 'ellipsis';
    titleLink.style.whiteSpace = 'nowrap';
    titleLink.style.flex = '1';
    titleLink.style.minWidth = '0';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-small';
    removeBtn.style.padding = '4px';
    removeBtn.style.minWidth = '24px';
    removeBtn.style.height = '24px';
    removeBtn.style.display = 'flex';
    removeBtn.style.alignItems = 'center';
    removeBtn.style.justifyContent = 'center';
    removeBtn.style.flexShrink = '0';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3.5 3.5V11.6667C3.5 12.5871 4.24619 13.3333 5.16667 13.3333H8.83333C9.75381 13.3333 10.5 12.5871 10.5 11.6667V3.5M5.83333 3.5V2.33333C5.83333 1.8731 6.20643 1.5 6.66667 1.5H7.33333C7.79357 1.5 8.16667 1.8731 8.16667 2.33333V3.5M2.33333 3.5H11.6667" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    removeBtn.addEventListener('click', () => {
      getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
        const results = data[STORAGE_KEY_JOB_RESULTS] || {};
        delete results[jobId];
        setStorageData({ [STORAGE_KEY_JOB_RESULTS]: results }, () => {
          showNotification('Job removed', 'info');
          loadSavedJobs();
        });
      });
    });

    topRow.appendChild(titleLink);
    topRow.appendChild(removeBtn);

    const bottomRow = document.createElement('div');
    bottomRow.style.display = 'flex';
    bottomRow.style.alignItems = 'center';
    bottomRow.style.justifyContent = 'space-between';
    bottomRow.style.gap = '8px';

    const companyName = document.createElement('span');
    companyName.textContent = job.companyName || 'Unknown Company';
    companyName.style.fontSize = '12px';
    companyName.style.color = '#6b7280';
    companyName.style.overflow = 'hidden';
    companyName.style.textOverflow = 'ellipsis';
    companyName.style.whiteSpace = 'nowrap';
    companyName.style.flex = '1';
    companyName.style.minWidth = '0';

    const badges = document.createElement('div');
    badges.style.display = 'flex';
    badges.style.gap = '6px';
    badges.style.flexShrink = '0';

    // Clickable Visa Badge & Accordion (No chevrons)
    const visaBadge = document.createElement('button');
    visaBadge.className = 'saved-badge clickable-badge';
    visaBadge.innerHTML = `<span>${visaMatchCount > 0 ? '✓ Visa' : '✗ Visa'}</span>`;
    visaBadge.style.background = visaMatchCount > 0 ? '#dcfce7' : '#fef2f2';
    visaBadge.style.color = visaMatchCount > 0 ? '#166534' : '#991b1b';
    visaBadge.style.border = 'none';
    visaBadge.style.padding = '2px 6px';
    visaBadge.style.borderRadius = '4px';
    visaBadge.style.fontSize = '11px';
    visaBadge.style.fontWeight = '500';
    visaBadge.style.whiteSpace = 'nowrap';
    visaBadge.title = 'Click to view visa keyword matches';

    let isVisaOpen = false;
    const visaAccordion = document.createElement('div');
    visaAccordion.className = 'saved-match-history search-input-hidden';

    visaBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      isVisaOpen = !isVisaOpen;
      visaBadge.classList.toggle('active', isVisaOpen);
      if (isVisaOpen) {
        visaAccordion.classList.remove('search-input-hidden');
        renderSavedJobMatches(visaAccordion, 'Visa Keyword Matches', job.visaMatches || []);
      } else {
        visaAccordion.classList.add('search-input-hidden');
      }
    });

    // Clickable Custom Match Badge & Accordion (No chevrons)
    const customBadge = document.createElement('button');
    customBadge.className = 'saved-badge clickable-badge';
    customBadge.innerHTML = `<span>${customMatchCount > 0 ? `${customMatchCount}x Match` : '✗ Match'}</span>`;
    customBadge.style.background = customMatchCount > 0 ? '#dcfce7' : '#fef2f2';
    customBadge.style.color = customMatchCount > 0 ? '#166534' : '#991b1b';
    customBadge.style.border = 'none';
    customBadge.style.padding = '2px 6px';
    customBadge.style.borderRadius = '4px';
    customBadge.style.fontSize = '11px';
    customBadge.style.fontWeight = '500';
    customBadge.style.whiteSpace = 'nowrap';
    customBadge.title = 'Click to view custom keyword matches';

    let isCustomOpen = false;
    const customAccordion = document.createElement('div');
    customAccordion.className = 'saved-match-history search-input-hidden';

    customBadge.addEventListener('click', (e) => {
      e.stopPropagation();
      isCustomOpen = !isCustomOpen;
      customBadge.classList.toggle('active', isCustomOpen);
      if (isCustomOpen) {
        customAccordion.classList.remove('search-input-hidden');
        renderSavedJobMatches(customAccordion, 'Custom Keyword Matches', job.customMatches || []);
      } else {
        customAccordion.classList.add('search-input-hidden');
      }
    });

    badges.appendChild(visaBadge);
    badges.appendChild(customBadge);

    // Clickable AI Badge & Accordion (Clicking ✨ badge expands insights directly, no chevrons, no separate button)
    let historyAccordion = null;
    if (aiInsights.length > 0) {
      const aiBadge = document.createElement('button');
      aiBadge.className = 'saved-ai-badge clickable-badge';
      aiBadge.textContent = `✨ ${aiInsights.length}`;
      aiBadge.title = `Click to view ${aiInsights.length} AI insight(s)`;

      historyAccordion = document.createElement('div');
      historyAccordion.className = 'saved-ai-history search-input-hidden';

      const isOpen = openSavedJobAccordions.has(`ai-${jobId}`);
      let isAccordionOpen = isOpen;
      if (isOpen) {
        aiBadge.classList.add('active');
        historyAccordion.classList.remove('search-input-hidden');
        renderSavedJobAIHistory(historyAccordion, aiInsights, jobId);
      }

      aiBadge.addEventListener('click', (e) => {
        e.stopPropagation();
        isAccordionOpen = !isAccordionOpen;
        if (isAccordionOpen) {
          openSavedJobAccordions.add(`ai-${jobId}`);
          aiBadge.classList.add('active');
          historyAccordion.classList.remove('search-input-hidden');
          renderSavedJobAIHistory(historyAccordion, aiInsights, jobId);
        } else {
          openSavedJobAccordions.delete(`ai-${jobId}`);
          aiBadge.classList.remove('active');
          historyAccordion.classList.add('search-input-hidden');
        }
      });

      badges.appendChild(aiBadge);
    } else {
      openSavedJobAccordions.delete(`ai-${jobId}`);
    }

    bottomRow.appendChild(companyName);
    bottomRow.appendChild(badges);

    card.appendChild(topRow);
    card.appendChild(bottomRow);
    card.appendChild(visaAccordion);
    card.appendChild(customAccordion);
    if (historyAccordion) {
      card.appendChild(historyAccordion);
    }
    savedJobsListEl.appendChild(card);
  });
}

function renderSavedJobMatches(container, title, matches) {
  container.innerHTML = '';
  const header = document.createElement('div');
  header.className = 'saved-match-header';
  header.textContent = title;
  container.appendChild(header);

  const activeMatches = (matches || []).filter(m => m && m.count > 0);
  if (activeMatches.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'saved-match-empty';
    emptyEl.textContent = 'No keyword matches found';
    container.appendChild(emptyEl);
    return;
  }

  const chipsContainer = document.createElement('div');
  chipsContainer.className = 'saved-match-chip-list';
  activeMatches.forEach(m => {
    const chip = document.createElement('span');
    chip.className = 'saved-match-chip';
    chip.innerHTML = `<span class="chip-key">${escapeHtml(m.key)}</span><span class="chip-count">×${m.count}</span>`;
    chipsContainer.appendChild(chip);
  });
  container.appendChild(chipsContainer);
}

// Initialize saved jobs on load
loadSavedJobs();
updateTotalSavedJobsMenu();
initExtensionVersion();

// Menu toggle functionality
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = menuDropdown.style.display !== 'none';
  menuDropdown.style.display = isVisible ? 'none' : 'block';
  if (!isVisible) {
    updateTotalSavedJobsMenu();
  }
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.style.display = 'none';
  }
});

// Search functionality
searchBtn.addEventListener('click', () => {
  const isVisible = searchInput.classList.contains('visible');
  if (isVisible) {
    // Start hide animation and clear search
    searchInput.classList.remove('visible');
    searchInput.value = '';
    currentSearchTerm = '';
    loadSavedJobs();
    // After animation, fully hide input if still not visible
    setTimeout(() => {
      if (!searchInput.classList.contains('visible') && !searchInput.value.trim()) {
        searchInput.classList.add('search-input-hidden');
      }
    }, 200);
  } else {
    // Show input and play open animation
    searchInput.classList.remove('search-input-hidden');
    requestAnimationFrame(() => {
      searchInput.classList.add('visible');
    });
    searchInput.focus();
  }
});

searchInput.addEventListener('input', (e) => {
  currentSearchTerm = e.target.value.toLowerCase().trim();
  loadSavedJobs();
});

// Close search when clicking outside (only when empty)
document.addEventListener('click', (e) => {
  if (!searchBtn.contains(e.target) && !searchInput.contains(e.target)) {
    const isVisible = searchInput.classList.contains('visible');
    if (isVisible && !searchInput.value.trim()) {
      searchInput.classList.remove('visible');
      currentSearchTerm = '';
      loadSavedJobs();
      setTimeout(() => {
        if (!searchInput.classList.contains('visible') && !searchInput.value.trim()) {
          searchInput.classList.add('search-input-hidden');
        }
      }, 200);
    }
  }
});

// Filter dropdown functionality
filterBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = filterDropdown.style.display !== 'none';
  filterDropdown.style.display = isVisible ? 'none' : 'block';
  // Close sort dropdown if open
  sortDropdown.style.display = 'none';
  // Close menu dropdown if open
  menuDropdown.style.display = 'none';
});

// Handle filter option clicks
filterVisaOption.addEventListener('click', () => {
  filterVisaEnabled = !filterVisaEnabled;
  updateFilterIndicators();
  loadSavedJobs();
});

filterMatchesOption.addEventListener('click', () => {
  filterMatchesEnabled = !filterMatchesEnabled;
  updateFilterIndicators();
  loadSavedJobs();
});

// Sort dropdown functionality
sortBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = sortDropdown.style.display !== 'none';
  sortDropdown.style.display = isVisible ? 'none' : 'block';
  // Close filter dropdown if open
  filterDropdown.style.display = 'none';
  // Close menu dropdown if open
  menuDropdown.style.display = 'none';
});

// Handle sort option clicks
sortLatestOption.addEventListener('click', () => {
  setActiveSort('latest');
});

sortEarliestOption.addEventListener('click', () => {
  setActiveSort('earliest');
});

sortMostMatchesOption.addEventListener('click', () => {
  setActiveSort('most-matches');
});

// Helper function to set active sort option
function setActiveSort(sortType) {
  currentSort = sortType;

  // Update active indicators
  document.querySelectorAll('.sort-dropdown-item').forEach(item => {
    const indicator = item.querySelector('.sort-indicator');
    if (item.dataset.sort === sortType) {
      if (indicator) indicator.classList.add('active');
      item.classList.add('active');
    } else {
      if (indicator) indicator.classList.remove('active');
      item.classList.remove('active');
    }
  });

  loadSavedJobs();
  sortDropdown.style.display = 'none';
}

// Close dropdowns when clicking outside
document.addEventListener('click', (e) => {
  if (!filterBtn.contains(e.target) && !filterDropdown.contains(e.target)) {
    filterDropdown.style.display = 'none';
  }
  if (!sortBtn.contains(e.target) && !sortDropdown.contains(e.target)) {
    sortDropdown.style.display = 'none';
  }
  if (!menuBtn.contains(e.target) && !menuDropdown.contains(e.target)) {
    menuDropdown.style.display = 'none';
  }
});

// Update filter visual indicators
function updateFilterIndicators() {
  const visaIndicator = filterVisaOption.querySelector('.filter-indicator');
  const matchesIndicator = filterMatchesOption.querySelector('.filter-indicator');

  if (visaIndicator) {
    visaIndicator.classList.toggle('active', filterVisaEnabled);
  }
  if (matchesIndicator) {
    matchesIndicator.classList.toggle('active', filterMatchesEnabled);
  }
}

// Initialize dropdown states on load
function initializeDropdowns() {
  // Ensure dropdowns are hidden on load
  if (menuDropdown) menuDropdown.style.display = 'none';
  if (filterDropdown) filterDropdown.style.display = 'none';
  if (sortDropdown) sortDropdown.style.display = 'none';
  updateFilterIndicators();
  setActiveSort(currentSort);
}

// Initialize keyword sections as collapsed
function initializeKeywordSections() {
  const visaContent = document.getElementById('visaKwContent');
  const visaToggle = document.getElementById('visaToggle');
  const customContent = document.getElementById('customKwContent');
  const customToggle = document.getElementById('customToggle');

  // Ensure they start collapsed (hidden)
  if (visaContent && !visaContent.classList.contains('search-input-hidden')) {
    visaContent.classList.add('search-input-hidden');
  }
  if (visaToggle) {
    visaToggle.textContent = '▶';
    visaToggle.style.transform = 'rotate(0deg)';
  }

  if (customContent && !customContent.classList.contains('search-input-hidden')) {
    customContent.classList.add('search-input-hidden');
  }
  if (customToggle) {
    customToggle.textContent = '▶';
    customToggle.style.transform = 'rotate(0deg)';
  }
}

initializeDropdowns();
initializeKeywordSections();

// Export jobs functionality
exportJobsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.style.display = 'none';

  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const savedJobs = data[STORAGE_KEY_JOB_RESULTS] || {};

    if (Object.keys(savedJobs).length === 0) {
      showNotification('No jobs to export', 'info');
      return;
    }

    // Create JSON string preserving all job scan data, badges, and AI insights
    const jsonStr = JSON.stringify(savedJobs, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);

    // Create a temporary anchor element to trigger download with save dialog
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `linkedin-job-lens-jobs-${dateStr}.json`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

    showNotification(`Exported ${Object.keys(savedJobs).length} job(s)`, 'success');
  });
});

// Import jobs functionality
importJobsBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  menuDropdown.style.display = 'none';
  importFileInput.click();
});

importFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.name.toLowerCase().endsWith('.json')) {
    showNotification('Please select a JSON file', 'error');
    e.target.value = '';
    return;
  }

  // Validate file size (max 10MB)
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_FILE_SIZE) {
    showNotification('File too large. Maximum size is 10MB', 'error');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);

      if (!parsed || (typeof parsed !== 'object')) {
        showNotification('Invalid JSON file format', 'error');
        e.target.value = '';
        return;
      }

      // Support direct map, wrapped object { jobs: ... }, or array of jobs
      let importedJobsMap = {};
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const id = item.jobId || item.id;
          if (id) importedJobsMap[id] = item;
        });
      } else if (parsed.jobs && typeof parsed.jobs === 'object' && !Array.isArray(parsed.jobs)) {
        importedJobsMap = parsed.jobs;
      } else {
        importedJobsMap = parsed;
      }

      // Filter out non-job metadata keys if present
      const validJobIds = Object.keys(importedJobsMap).filter(k => k !== 'version' && k !== 'exportedAt' && k !== '_meta' && typeof importedJobsMap[k] === 'object');
      if (validJobIds.length === 0) {
        showNotification('No valid jobs found in import file', 'error');
        e.target.value = '';
        return;
      }

      // Merge with existing jobs, safely preserving and combining AI insights
      getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
        const existingJobs = data[STORAGE_KEY_JOB_RESULTS] || {};
        const mergedJobs = { ...existingJobs };

        validJobIds.forEach((jobId) => {
          const imp = importedJobsMap[jobId];
          const ext = existingJobs[jobId] || {};

          // Merge AI insights preserving both sets without duplicates
          const impInsights = Array.isArray(imp.aiInsights) ? imp.aiInsights : [];
          const extInsights = Array.isArray(ext.aiInsights) ? ext.aiInsights : [];
          const combinedInsights = [...impInsights];
          const seenIds = new Set(impInsights.map(s => s.id));
          extInsights.forEach(s => {
            if (s && s.id && !seenIds.has(s.id)) {
              seenIds.add(s.id);
              combinedInsights.push(s);
            }
          });

          mergedJobs[jobId] = {
            ...ext,
            ...imp,
            jobId,
            aiInsights: combinedInsights.slice(0, 4)
          };
          delete mergedJobs[jobId].description;
        });

        // Save merged jobs
        setStorageData({ [STORAGE_KEY_JOB_RESULTS]: mergedJobs }, () => {
          const importedCount = validJobIds.length;
          const newCount = validJobIds.filter(id => !existingJobs[id]).length;
          showNotification(`Imported ${importedCount} job(s) (${newCount} new)`, 'success');
          loadSavedJobs();

          // If current open job in main panel was updated, refresh AI insights
          if (currentJobId && mergedJobs[currentJobId]) {
            renderAISlots(mergedJobs[currentJobId].aiInsights || []);
          }
        });
      });
    } catch (error) {
      showNotification('Failed to parse JSON file: ' + (error.message || 'Unknown error'), 'error');
      e.target.value = '';
    }
  };

  reader.onerror = () => {
    showNotification('Failed to read file', 'error');
    e.target.value = '';
  };

  reader.readAsText(file);

  // Reset input so same file can be selected again
  e.target.value = '';
});

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} s - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

/**
 * Formats AI answer text with bold (**text**), italic (*text*), and code (`text`) formatting
 * while escaping HTML to prevent XSS and preserving multiline formatting.
 * @param {string} rawText
 * @returns {string} Formatted HTML string
 */
function formatAiAnswerText(rawText) {
  if (!rawText) return '';

  let safe = escapeHtml(String(rawText));

  // Underline: <u>text</u> (escaped by escapeHtml as &lt;u&gt;...&lt;/u&gt;)
  safe = safe.replace(/&lt;u&gt;([\s\S]+?)&lt;\/u&gt;/gi, '<u>$1</u>');

  // Strikethrough: ~~text~~ or <del>/<s> tags
  safe = safe.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
  safe = safe.replace(/&lt;del&gt;([\s\S]+?)&lt;\/del&gt;/gi, '<del>$1</del>');
  safe = safe.replace(/&lt;s&gt;([\s\S]+?)&lt;\/s&gt;/gi, '<del>$1</del>');
  safe = safe.replace(/&lt;strike&gt;([\s\S]+?)&lt;\/strike&gt;/gi, '<del>$1</del>');

  // Bold-italic: ***text*** or ___text___
  safe = safe.replace(/\*\*\*([^*\n]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  safe = safe.replace(/___([^_\n]+?)___/g, '<strong><em>$1</em></strong>');

  // Bold: **text** or __text__
  safe = safe.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  safe = safe.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');

  // Bullet points: lines starting with optional whitespace and *, -, or •
  safe = safe.replace(/^[ \t]*[*•-][ \t]+(.*)$/gm, '<li class="ai-bullet-item">$1</li>');

  // Group consecutive <li> items into a single <ul class="ai-bullet-list">
  safe = safe.replace(/((?:<li class="ai-bullet-item">[\s\S]*?<\/li>[\r\n]*)+)/g, (match) => {
    const cleaned = match.replace(/[\r\n]+/g, '');
    return `<ul class="ai-bullet-list">${cleaned}</ul>`;
  });

  // Clean up any extra newline immediately before or after <ul>/</ul>
  safe = safe.replace(/\n?(<ul class="ai-bullet-list">[\s\S]*?<\/ul>)\n?/g, '$1');

  // Italic: *text* (avoiding empty or multiline match)
  safe = safe.replace(/(?<=^|[^*])\*(?!\*)([^*\n]+?)(?<!\*)\*(?=[^*]|$)/g, '<em>$1</em>');
  // Italic: _text_ (ensure not inside snake_case words like var_name)
  safe = safe.replace(/(?<=^|[^a-zA-Z0-9_])_(?!_)([^_\n]+?)(?<!_)_(?=[^a-zA-Z0-9_]|$)/g, '<em>$1</em>');

  // Inline code: `code`
  safe = safe.replace(/`([^`\n]+?)`/g, '<code class="ai-inline-code">$1</code>');

  return safe;
}

// ============================================================================
// AI INSIGHT & TEMPLATE MANAGEMENT FUNCTIONS
// ============================================================================

// Subview navigation (Main <-> Templates <-> Settings)
function showView(viewName) {
  if (!mainView || !templatesView || !settingsView) return;
  mainView.classList.remove('active-view');
  templatesView.classList.remove('active-view');
  settingsView.classList.remove('active-view');

  if (viewName === 'templates') {
    templatesView.classList.add('active-view');
    renderTemplatesList();
  } else if (viewName === 'settings') {
    settingsView.classList.add('active-view');
    loadSettingsIntoUI();
  } else {
    mainView.classList.add('active-view');
  }
}

if (templatesNavBtn) templatesNavBtn.addEventListener('click', () => showView('templates'));
if (settingsNavBtn) settingsNavBtn.addEventListener('click', () => showView('settings'));
if (templatesBackBtn) templatesBackBtn.addEventListener('click', () => showView('main'));
if (settingsBackBtn) settingsBackBtn.addEventListener('click', () => showView('main'));

// Auto AI Checkbox Listener
if (autoAiCheckbox) {
  autoAiCheckbox.addEventListener('change', (e) => {
    aiSettings.autoInsight = e.target.checked;
    if (autoAiToggleBtn) {
      autoAiToggleBtn.classList.toggle('checked', e.target.checked);
    }
    persistAISettings(() => {
      showNotification(
        aiSettings.autoInsight ? 'Auto-run AI insight enabled' : 'Auto-run AI insight disabled',
        'info'
      );
    });
  });
}

function persistAISettings(cb) {
  setStorageData({ [STORAGE_KEY_AI_SETTINGS]: aiSettings }, () => {
    if (cb) cb();
  });
}

function persistTemplates(cb) {
  setStorageData(
    {
      [STORAGE_KEY_TEMPLATES]: insightTemplates,
      [STORAGE_KEY_ACTIVE_TEMPLATE]: activeTemplateId
    },
    () => {
      updateActiveTemplateUI();
      if (cb) cb();
    }
  );
}

function getActiveTemplate() {
  if (!insightTemplates || insightTemplates.length === 0) return null;
  return insightTemplates.find((t) => t.id === activeTemplateId) || insightTemplates[0] || null;
}

function updateActiveTemplateUI() {
  const active = getActiveTemplate();
  if (activeTemplateNameDisplay) {
    activeTemplateNameDisplay.textContent = active ? active.name : '(No template selected)';
  }
  if (runInsightBtnText) {
    runInsightBtnText.textContent = 'Generate Insight';
  }
  if (runInsightBtn) {
    if (active) {
      const currentSlotsCount = aiSlotsContainer ? aiSlotsContainer.children.length : 0;
      runInsightBtn.disabled = currentSlotsCount >= 4;
    } else {
      runInsightBtn.disabled = true;
    }
  }
}

// Render Templates List in Templates Subview
function renderTemplatesList() {
  if (!templatesListEl) return;
  templatesListEl.innerHTML = '';
  if (insightTemplates.length === 0) {
    templatesListEl.innerHTML = '<div class="muted" style="padding: 24px; text-align: center;">No templates created yet.<br>Click "+ New" above to create your first insight template.</div>';
    return;
  }

  insightTemplates.forEach((template) => {
    const card = document.createElement('div');
    card.className = `template-card ${template.id === activeTemplateId ? 'active-template' : ''}`;

    const header = document.createElement('div');
    header.className = 'template-card-header';

    const titleGroup = document.createElement('div');
    titleGroup.className = 'template-card-title-group';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'template-card-name';
    nameSpan.textContent = template.name;
    titleGroup.appendChild(nameSpan);

    if (template.id === activeTemplateId) {
      const badge = document.createElement('span');
      badge.className = 'template-active-badge';
      badge.textContent = 'Active';
      titleGroup.appendChild(badge);
    }

    const actions = document.createElement('div');
    actions.className = 'template-card-actions';

    // Set Active Button
    if (template.id !== activeTemplateId) {
      const setActiveBtn = document.createElement('button');
      setActiveBtn.className = 'btn btn-small';
      setActiveBtn.textContent = 'Set Active';
      setActiveBtn.title = 'Set as current template for analysis';
      setActiveBtn.addEventListener('click', () => {
        activeTemplateId = template.id;
        persistTemplates(() => {
          renderTemplatesList();
          showNotification(`Active template: ${template.name}`, 'info');
        });
      });
      actions.appendChild(setActiveBtn);
    }

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-small';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openTemplateEditor(template.id));
    actions.appendChild(editBtn);

    // Duplicate Button
    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn btn-small';
    dupBtn.textContent = 'Duplicate';
    dupBtn.addEventListener('click', () => {
      const copy = JSON.parse(JSON.stringify(template));
      copy.id = 'tpl_' + Date.now();
      copy.name = `${copy.name} (Copy)`;
      delete copy.isDefault;
      insightTemplates.push(copy);
      persistTemplates(() => {
        renderTemplatesList();
        showNotification('Template duplicated', 'success');
      });
    });
    actions.appendChild(dupBtn);

    // Delete Button (allow delete if more than 1 template)
    if (insightTemplates.length > 1) {
      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-small';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Delete Template';
      delBtn.style.color = '#ef4444';
      delBtn.addEventListener('click', () => {
        if (confirm(`Delete template "${template.name}"?`)) {
          insightTemplates = insightTemplates.filter((t) => t.id !== template.id);
          if (activeTemplateId === template.id) {
            activeTemplateId = insightTemplates[0].id;
          }
          persistTemplates(() => {
            renderTemplatesList();
            showNotification('Template deleted', 'info');
          });
        }
      });
      actions.appendChild(delBtn);
    }

    header.appendChild(titleGroup);
    header.appendChild(actions);
    card.appendChild(header);

    // Context preview
    if (template.context && template.context.trim()) {
      const ctxPreview = document.createElement('div');
      ctxPreview.className = 'template-card-context-preview';
      ctxPreview.textContent = `Context: ${template.context.slice(0, 100)}...`;
      card.appendChild(ctxPreview);
    }

    // Criteria tags
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'template-card-criteria-tags';
    (template.criterias || []).forEach((c) => {
      const tag = document.createElement('span');
      tag.className = `template-criteria-tag ${c.enabled === false ? 'disabled' : ''}`;
      tag.textContent = c.name;
      tagsContainer.appendChild(tag);
    });
    card.appendChild(tagsContainer);

    templatesListEl.appendChild(card);
  });
}

function openTemplateEditor(templateId) {
  editingTemplateId = templateId;
  if (!criteriaEditorList) return;
  criteriaEditorList.innerHTML = '';

  if (templateId) {
    const tpl = insightTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    if (templateEditorTitle) templateEditorTitle.textContent = 'Edit Template';
    if (templateNameInput) templateNameInput.value = tpl.name || '';
    if (templateContextInput) templateContextInput.value = tpl.context || '';
    (tpl.criterias || []).forEach((c) => addCriterionRow(c.name, c.instruction, c.enabled));
  } else {
    if (templateEditorTitle) templateEditorTitle.textContent = 'New Template';
    if (templateNameInput) templateNameInput.value = '';
    if (templateContextInput) templateContextInput.value = '';
    addCriterionRow('', '', true);
  }

  if (templateEditorOverlay) {
    templateEditorOverlay.classList.remove('search-input-hidden');
  }
  if (templateNameInput) templateNameInput.focus();
}

function closeTemplateEditor() {
  if (templateEditorOverlay) {
    templateEditorOverlay.classList.add('search-input-hidden');
  }
  editingTemplateId = null;
}

if (closeTemplateEditorBtn) closeTemplateEditorBtn.addEventListener('click', closeTemplateEditor);
if (cancelTemplateBtn) cancelTemplateBtn.addEventListener('click', closeTemplateEditor);
if (newTemplateBtn) newTemplateBtn.addEventListener('click', () => openTemplateEditor(null));

// ============================================
// Confirmation Modal
// ============================================
let pendingConfirmationAction = null;

function showConfirmationModal({
  title = 'Remove Insight',
  message = 'Are you sure you want to remove this insight? This action cannot be undone.',
  confirmText = 'Remove',
  confirmClass = 'btn-danger',
  onConfirm = null
} = {}) {
  if (!confirmationModalOverlay) return;

  if (confirmationModalTitle) confirmationModalTitle.textContent = title;
  if (confirmationModalMessage) confirmationModalMessage.textContent = message;

  if (confirmActionBtn) {
    confirmActionBtn.textContent = confirmText;
    confirmActionBtn.className = `btn ${confirmClass}`;
  }

  pendingConfirmationAction = onConfirm;
  confirmationModalOverlay.classList.remove('search-input-hidden');
}

function hideConfirmationModal() {
  if (confirmationModalOverlay) {
    confirmationModalOverlay.classList.add('search-input-hidden');
  }
  pendingConfirmationAction = null;
}

if (cancelActionBtn) cancelActionBtn.addEventListener('click', hideConfirmationModal);
if (closeConfirmationModalBtn) closeConfirmationModalBtn.addEventListener('click', hideConfirmationModal);
if (confirmationModalOverlay) {
  confirmationModalOverlay.addEventListener('click', (e) => {
    if (e.target === confirmationModalOverlay) hideConfirmationModal();
  });
}
if (confirmActionBtn) {
  confirmActionBtn.addEventListener('click', () => {
    const action = pendingConfirmationAction;
    hideConfirmationModal();
    if (typeof action === 'function') {
      action();
    }
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmationModalOverlay && !confirmationModalOverlay.classList.contains('search-input-hidden')) {
    hideConfirmationModal();
  }
});

function addCriterionRow(name = '', instruction = '', enabled = true) {
  if (!criteriaEditorList) return;
  const item = document.createElement('div');
  item.className = 'criteria-editor-item';

  const top = document.createElement('div');
  top.className = 'criteria-editor-top';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = enabled !== false;
  checkbox.title = 'Enable / Disable criteria';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'form-input criteria-name-input';
  nameInput.placeholder = 'Criteria Name (e.g. Skill Match)';
  nameInput.value = name;

  const delBtn = document.createElement('button');
  delBtn.className = 'criteria-editor-delete-btn';
  delBtn.type = 'button';
  delBtn.innerHTML = '&times;';
  delBtn.title = 'Remove criterion';
  delBtn.addEventListener('click', () => item.remove());

  top.appendChild(checkbox);
  top.appendChild(nameInput);
  top.appendChild(delBtn);

  const instrInput = document.createElement('textarea');
  instrInput.className = 'form-textarea criteria-instruction-input';
  instrInput.rows = 3;
  instrInput.placeholder = 'Instruction for this criteria (e.g. rate 0-100% and explain why)';
  instrInput.value = instruction;

  item.appendChild(top);
  item.appendChild(instrInput);
  criteriaEditorList.appendChild(item);
}

if (addCriterionBtn) {
  addCriterionBtn.addEventListener('click', () => {
    addCriterionRow('', '', true);
  });
}

if (saveTemplateBtn) {
  saveTemplateBtn.addEventListener('click', () => {
    const name = templateNameInput.value.trim();
    if (!name) {
      showNotification('Template name is required', 'error');
      templateNameInput.focus();
      return;
    }

    const context = templateContextInput.value.trim();
    const criteriaItems = criteriaEditorList.querySelectorAll('.criteria-editor-item');
    const criterias = [];

    criteriaItems.forEach((item, idx) => {
      const cName = item.querySelector('.criteria-name-input').value.trim();
      const cInstr = item.querySelector('.criteria-instruction-input').value.trim();
      const cEnabled = item.querySelector('input[type="checkbox"]').checked;
      if (cName) {
        criterias.push({
          id: `c_${Date.now()}_${idx}`,
          name: cName,
          instruction: cInstr,
          enabled: cEnabled
        });
      }
    });

    if (criterias.length === 0) {
      showNotification('Please add at least one criteria with a name', 'error');
      return;
    }

    if (editingTemplateId) {
      const tpl = insightTemplates.find((t) => t.id === editingTemplateId);
      if (tpl) {
        tpl.name = name;
        tpl.context = context;
        tpl.criterias = criterias;
      }
    } else {
      const newTpl = {
        id: 'tpl_' + Date.now(),
        name,
        context,
        criterias
      };
      insightTemplates.push(newTpl);
      activeTemplateId = newTpl.id;
    }

    persistTemplates(() => {
      closeTemplateEditor();
      renderTemplatesList();
      showNotification('Template saved', 'success');
    });
  });
}

function initExtensionVersion() {
  const versionEl = document.getElementById('extensionVersion');
  if (!versionEl) return;
  const manifest = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
    ? chrome.runtime.getManifest()
    : null;
  const version = manifest?.version || '2.0.0';
  versionEl.textContent = `Version ${version}`;
}

function compareSemver(vA, vB) {
  const clean = (v) => String(v || '').trim().replace(/^[^\d]*/, '');
  const partsA = clean(vA).split('.').map(n => parseInt(n, 10) || 0);
  const partsB = clean(vB).split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

if (checkUpdatesBtn) {
  checkUpdatesBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!updateStatusMessage) return;

    const manifest = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
      ? chrome.runtime.getManifest()
      : null;
    const currentVersion = manifest?.version || '2.0.0';

    checkUpdatesBtn.textContent = 'Checking...';
    checkUpdatesBtn.style.pointerEvents = 'none';
    updateStatusMessage.className = 'settings-status-message search-input-hidden';

    try {
      const resp = await fetch('https://api.github.com/repos/alireza-malek/linkedin-job-lens/releases/latest', {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!resp.ok) {
        if (resp.status === 404) {
          updateStatusMessage.textContent = 'No releases found on GitHub.';
          updateStatusMessage.className = 'settings-status-message';
          return;
        }
        if (resp.status === 403) {
          updateStatusMessage.textContent = 'GitHub rate limit exceeded. Please try again later.';
          updateStatusMessage.className = 'settings-status-message error';
          return;
        }
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      const latestTag = data.tag_name || data.name || '';
      const releaseUrl = data.html_url || 'https://github.com/alireza-malek/linkedin-job-lens/releases';

      if (compareSemver(latestTag, currentVersion) > 0) {
        updateStatusMessage.className = 'settings-status-message success';
        updateStatusMessage.innerHTML = `New version <strong>${escapeHtml(latestTag)}</strong> available! <a href="${escapeHtml(releaseUrl)}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline; font-weight: 600; margin-left: 4px;">Download from Releases Page</a>`;
      } else {
        updateStatusMessage.className = 'settings-status-message success';
        updateStatusMessage.textContent = `You're on the latest version (${currentVersion}).`;
      }
    } catch (err) {
      updateStatusMessage.className = 'settings-status-message error';
      updateStatusMessage.textContent = `Failed to check for updates: ${err.message}`;
    } finally {
      checkUpdatesBtn.textContent = 'Check for update';
      checkUpdatesBtn.style.pointerEvents = '';
    }
  });
}

// Settings UI management
function loadSettingsIntoUI() {
  if (aiBaseUrlInput) aiBaseUrlInput.value = aiSettings.baseUrl || 'https://api.openai.com/v1';
  if (aiApiKeyInput) aiApiKeyInput.value = aiSettings.apiKey || '';
  if (aiModelInput) aiModelInput.value = aiSettings.model || '';
  if (aiTemperatureInput) aiTemperatureInput.value = (aiSettings.temperature !== undefined && aiSettings.temperature !== null) ? aiSettings.temperature : 0.3;
  if (aiMaxTokensInput) aiMaxTokensInput.value = aiSettings.maxTokens || '';
  if (aiReasoningEffortInput) aiReasoningEffortInput.value = aiSettings.reasoningEffort || '';
  if (aiSystemInstructionInput) aiSystemInstructionInput.value = aiSettings.systemInstruction || '';
  if (aiSettingsStatus) aiSettingsStatus.className = 'settings-status-message search-input-hidden';
  if (updateStatusMessage) updateStatusMessage.className = 'settings-status-message search-input-hidden';
  initExtensionVersion();
}

if (toggleApiKeyBtn) {
  toggleApiKeyBtn.addEventListener('click', () => {
    if (aiApiKeyInput.type === 'password') {
      aiApiKeyInput.type = 'text';
      toggleApiKeyBtn.textContent = '🔒';
    } else {
      aiApiKeyInput.type = 'password';
      toggleApiKeyBtn.textContent = '👁️';
    }
  });
}

if (refreshModelsBtn) {
  refreshModelsBtn.addEventListener('click', async () => {
    const baseUrl = (aiBaseUrlInput && aiBaseUrlInput.value.trim()) || 'https://api.openai.com/v1';
    const apiKey = (aiApiKeyInput && aiApiKeyInput.value.trim()) || '';

    if (modelsDiscoveryStatus) modelsDiscoveryStatus.textContent = 'Discovering models...';
    refreshModelsBtn.disabled = true;

    try {
      const models = await window.AIService.discoverModels(baseUrl, apiKey);
      if (aiModelsDatalist) {
        aiModelsDatalist.innerHTML = '';
        models.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m;
          aiModelsDatalist.appendChild(opt);
        });
      }

      if (modelsDiscoveryStatus) {
        modelsDiscoveryStatus.textContent = `Discovered ${models.length} model(s). Select from dropdown or keep your input.`;
      }
      showNotification(`Found ${models.length} model(s)`, 'success');
    } catch (err) {
      if (modelsDiscoveryStatus) {
        modelsDiscoveryStatus.textContent = `Discovery failed: ${err.message}`;
      }
      showNotification(`Model discovery failed: ${err.message}`, 'error', 4000);
    } finally {
      refreshModelsBtn.disabled = false;
    }
  });
}

if (testAiConnectionBtn) {
  testAiConnectionBtn.addEventListener('click', async () => {
    const baseUrl = (aiBaseUrlInput && aiBaseUrlInput.value.trim()) || 'https://api.openai.com/v1';
    const apiKey = (aiApiKeyInput && aiApiKeyInput.value.trim()) || '';

    testAiConnectionBtn.disabled = true;
    testAiConnectionBtn.textContent = 'Testing...';
    if (aiSettingsStatus) aiSettingsStatus.className = 'settings-status-message search-input-hidden';

    const res = await window.AIService.testConnection(baseUrl, apiKey);
    testAiConnectionBtn.disabled = false;
    testAiConnectionBtn.textContent = 'Test Connection';

    if (aiSettingsStatus) {
      aiSettingsStatus.textContent = res.message;
      aiSettingsStatus.className = `settings-status-message ${res.ok ? 'success' : 'error'}`;
    }
  });
}

if (saveAiSettingsBtn) {
  saveAiSettingsBtn.addEventListener('click', () => {
    if (aiBaseUrlInput) aiSettings.baseUrl = aiBaseUrlInput.value.trim() || 'https://api.openai.com/v1';
    if (aiApiKeyInput) aiSettings.apiKey = aiApiKeyInput.value.trim();
    if (aiModelInput) aiSettings.model = aiModelInput.value.trim();
    if (aiTemperatureInput) {
      const tempVal = parseFloat(aiTemperatureInput.value.trim());
      aiSettings.temperature = !isNaN(tempVal) ? tempVal : 0.3;
    }
    if (aiMaxTokensInput) {
      const maxTokVal = parseInt(aiMaxTokensInput.value.trim(), 10);
      aiSettings.maxTokens = (!isNaN(maxTokVal) && maxTokVal > 0) ? maxTokVal : '';
    }
    if (aiReasoningEffortInput) aiSettings.reasoningEffort = aiReasoningEffortInput.value.trim();
    if (aiSystemInstructionInput) aiSettings.systemInstruction = aiSystemInstructionInput.value.trim();

    persistAISettings(() => {
      if (aiSettingsStatus) {
        aiSettingsStatus.textContent = 'Settings saved successfully!';
        aiSettingsStatus.className = 'settings-status-message success';
      }
      showNotification('AI Settings saved', 'success');
    });
  });
}

// Export Settings: Do NOT export the API key (per user explicit direction)
if (exportSettingsBtn) {
  exportSettingsBtn.addEventListener('click', () => {
    getStorageData(
      ['visaKeywords', 'customKeywords', STORAGE_KEY_AI_SETTINGS, STORAGE_KEY_TEMPLATES, STORAGE_KEY_ACTIVE_TEMPLATE],
      (data) => {
        const manifest = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest)
          ? chrome.runtime.getManifest()
          : null;
        const settingsPayload = {
          version: manifest?.version || '2.0.0',
          exportedAt: new Date().toISOString(),
          visaKeywords: data.visaKeywords || visaKeywords,
          customKeywords: data.customKeywords || customKeywords,
          templates: data[STORAGE_KEY_TEMPLATES] || insightTemplates,
          activeTemplateId: data[STORAGE_KEY_ACTIVE_TEMPLATE] || activeTemplateId,
          aiSettings: {
            baseUrl: aiSettings.baseUrl,
            model: aiSettings.model,
            systemInstruction: aiSettings.systemInstruction,
            temperature: aiSettings.temperature !== undefined ? aiSettings.temperature : 0.3,
            maxTokens: aiSettings.maxTokens || '',
            reasoningEffort: aiSettings.reasoningEffort || '',
            autoInsight: aiSettings.autoInsight
            // NOTE: API Key is intentionally NOT exported for user security
          }
        };

        const jsonStr = JSON.stringify(settingsPayload, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `linkedin-job-lens-settings-${dateStr}.json`;

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        showNotification('Settings exported (API key excluded)', 'success');
      }
    );
  });
}

// Import Settings
if (importSettingsBtn) {
  importSettingsBtn.addEventListener('click', () => {
    if (importSettingsInput) importSettingsInput.click();
  });
}

if (importSettingsInput) {
  importSettingsInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      showNotification('Please select a JSON file', 'error');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (!imported || typeof imported !== 'object') {
          throw new Error('Invalid JSON format');
        }

        if (Array.isArray(imported.visaKeywords)) {
          visaKeywords = imported.visaKeywords;
        }
        if (Array.isArray(imported.customKeywords)) {
          customKeywords = imported.customKeywords;
        }
        if (Array.isArray(imported.templates)) {
          insightTemplates = imported.templates;
        }
        if (imported.activeTemplateId) {
          activeTemplateId = imported.activeTemplateId;
        }
        if (imported.aiSettings && typeof imported.aiSettings === 'object') {
          aiSettings = {
            ...aiSettings,
            baseUrl: imported.aiSettings.baseUrl || aiSettings.baseUrl,
            model: imported.aiSettings.model || aiSettings.model,
            systemInstruction: imported.aiSettings.systemInstruction || aiSettings.systemInstruction,
            temperature: imported.aiSettings.temperature !== undefined ? imported.aiSettings.temperature : aiSettings.temperature,
            maxTokens: imported.aiSettings.maxTokens !== undefined ? imported.aiSettings.maxTokens : aiSettings.maxTokens,
            reasoningEffort: imported.aiSettings.reasoningEffort !== undefined ? imported.aiSettings.reasoningEffort : (aiSettings.reasoningEffort || ''),
            autoInsight: !!imported.aiSettings.autoInsight
            // Keeps existing local API Key
          };
        }

        setStorageData(
          {
            visaKeywords,
            customKeywords,
            [STORAGE_KEY_TEMPLATES]: insightTemplates,
            [STORAGE_KEY_ACTIVE_TEMPLATE]: activeTemplateId,
            [STORAGE_KEY_AI_SETTINGS]: aiSettings
          },
          () => {
            renderKeywords();
            updateActiveTemplateUI();
            loadSettingsIntoUI();
            if (autoAiCheckbox) {
              autoAiCheckbox.checked = !!aiSettings.autoInsight;
              if (autoAiToggleBtn) {
                autoAiToggleBtn.classList.toggle('checked', !!aiSettings.autoInsight);
              }
            }
            showNotification('Settings imported successfully', 'success');
          }
        );
      } catch (err) {
        showNotification(`Import failed: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

// Template 3-dots Menu & Copy Prompt
if (templateMenuBtn && templateActionDropdown) {
  templateMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (templateDropdownMenu) {
      templateDropdownMenu.style.display = 'none';
      if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(0deg)';
    }
    const isVisible = templateActionDropdown.style.display === 'block';
    templateActionDropdown.style.display = isVisible ? 'none' : 'block';
  });
}

if (copyPromptBtn) {
  copyPromptBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (templateActionDropdown) templateActionDropdown.style.display = 'none';

    const activeTemplate = getActiveTemplate();
    if (!activeTemplate) {
      showNotification('No active insight template selected', 'error');
      return;
    }

    const promptText = window.AIService.buildInsightUserPrompt({
      template: activeTemplate,
      jobDetails: currentJobDetails || {}
    });

    navigator.clipboard.writeText(promptText)
      .then(() => {
        showNotification('Generate Insight user prompt copied to clipboard', 'success');
      })
      .catch(() => {
        showNotification('Failed to copy prompt to clipboard', 'error');
      });
  });
}

// Template Switcher Dropdown
if (templateSelectBtn) {
  templateSelectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (templateActionDropdown) templateActionDropdown.style.display = 'none';
    if (!templateDropdownMenu) return;
    const isVisible = templateDropdownMenu.style.display === 'block';
    if (isVisible) {
      templateDropdownMenu.style.display = 'none';
      if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(0deg)';
    } else {
      renderTemplateDropdown();
      templateDropdownMenu.style.display = 'block';
      if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(180deg)';
    }
  });
}

function renderTemplateDropdown() {
  if (!templateDropdownMenu) return;
  templateDropdownMenu.innerHTML = '';

  if (!insightTemplates || insightTemplates.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'dropdown-menu-item';
    emptyItem.style.color = 'var(--color-primary)';
    emptyItem.style.fontWeight = '500';
    emptyItem.textContent = '+ Create New Template';
    emptyItem.addEventListener('click', () => {
      templateDropdownMenu.style.display = 'none';
      if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(0deg)';
      showView('templates');
      openTemplateEditor(null);
    });
    templateDropdownMenu.appendChild(emptyItem);
    return;
  }

  insightTemplates.forEach((t) => {
    const item = document.createElement('div');
    item.className = 'dropdown-menu-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = t.name;
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    item.appendChild(nameSpan);

    if (t.id === activeTemplateId) {
      const check = document.createElement('span');
      check.textContent = '✓';
      check.style.color = '#3b82f6';
      check.style.fontWeight = 'bold';
      check.style.marginLeft = '8px';
      item.appendChild(check);
    }

    item.addEventListener('click', () => {
      activeTemplateId = t.id;
      persistTemplates(() => {
        updateActiveTemplateUI();
        templateDropdownMenu.style.display = 'none';
        if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(0deg)';
        showNotification(`Selected template: ${t.name}`, 'info');
      });
    });

    templateDropdownMenu.appendChild(item);
  });
}

// Close template dropdown and 3-dots action menu on outside click
document.addEventListener('click', (e) => {
  if (templateMenuBtn && templateActionDropdown && !templateMenuBtn.contains(e.target) && !templateActionDropdown.contains(e.target)) {
    templateActionDropdown.style.display = 'none';
  }
  if (templateSelectBtn && templateDropdownMenu && !templateSelectBtn.contains(e.target) && !templateDropdownMenu.contains(e.target)) {
    templateDropdownMenu.style.display = 'none';
    if (templateChevronIcon) templateChevronIcon.style.transform = 'rotate(0deg)';
  }
});

// Toggle Ask Anything Form
if (toggleAskBtn) {
  toggleAskBtn.addEventListener('click', () => {
    if (!askAnythingBox) return;
    const isHidden = askAnythingBox.classList.contains('search-input-hidden');
    if (isHidden) {
      askAnythingBox.classList.remove('search-input-hidden');
      toggleAskBtn.classList.add('active');
      if (askQueryInput) askQueryInput.focus();
    } else {
      askAnythingBox.classList.add('search-input-hidden');
      toggleAskBtn.classList.remove('active');
    }
  });
}

if (cancelAskBtn) {
  cancelAskBtn.addEventListener('click', () => {
    if (askAnythingBox) askAnythingBox.classList.add('search-input-hidden');
    if (toggleAskBtn) toggleAskBtn.classList.remove('active');
  });
}

// Get stored slots for current job
function loadAISlotsForCurrentJob(jobId, cb) {
  if (!jobId) {
    if (cb) cb([]);
    return;
  }
  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const jobs = data[STORAGE_KEY_JOB_RESULTS] || {};
    const job = jobs[jobId];
    const slots = (job && Array.isArray(job.aiInsights)) ? job.aiInsights : [];
    if (cb) cb(slots);
  });
}

function updateSlotControlsState(slotsCount) {
  const isFull = slotsCount >= 4;
  if (runInsightBtn) runInsightBtn.disabled = isFull;
  if (toggleAskBtn) toggleAskBtn.disabled = isFull;
  if (slotLimitNotice) {
    if (isFull) {
      slotLimitNotice.classList.remove('search-input-hidden');
      if (askAnythingBox) askAnythingBox.classList.add('search-input-hidden');
      if (toggleAskBtn) toggleAskBtn.classList.remove('active');
    } else {
      slotLimitNotice.classList.add('search-input-hidden');
    }
  }
}

function createCriteriaItemElement({ name, text, copyTitle = 'Copy result', allowCopy = true }) {
  const item = document.createElement('div');
  item.className = 'ai-criteria-item';

  const header = document.createElement('div');
  header.className = 'ai-criteria-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'ai-criteria-name';
  const trimmedName = (name || '').trim();
  const displayName = (trimmedName && !trimmedName.endsWith(':') && !trimmedName.endsWith('?'))
    ? `${trimmedName}:`
    : trimmedName;
  titleEl.textContent = displayName;
  header.appendChild(titleEl);

  const actions = document.createElement('div');
  actions.className = 'ai-criteria-actions';

  if (allowCopy) {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-criteria-copy-btn';
    copyBtn.title = copyTitle;
    copyBtn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M5.5 2.5H11.5C12.0523 2.5 12.5 2.94772 12.5 3.5V9.5C12.5 10.0523 12.0523 10.5 11.5 10.5H9.5V12.5C9.5 13.0523 9.05228 13.5 8.5 13.5H2.5C1.94772 13.5 1.5 13.0523 1.5 12.5V6.5C1.5 5.94772 1.94772 5.5 2.5 5.5H4.5V3.5C4.5 2.94772 4.94772 2.5 5.5 2.5Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M4.5 5.5H8.5C9.05228 5.5 9.5 5.94772 9.5 6.5V10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text || '');
      copyBtn.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 8.5L6.5 12L13 4" stroke="#16a34a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.5 2.5H11.5C12.0523 2.5 12.5 2.94772 12.5 3.5V9.5C12.5 10.0523 12.0523 10.5 11.5 10.5H9.5V12.5C9.5 13.0523 9.05228 13.5 8.5 13.5H2.5C1.94772 13.5 1.5 13.0523 1.5 12.5V6.5C1.5 5.94772 1.94772 5.5 2.5 5.5H4.5V3.5C4.5 2.94772 4.94772 2.5 5.5 2.5Z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M4.5 5.5H8.5C9.05228 5.5 9.5 5.94772 9.5 6.5V10.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>`;
      }, 1500);
      showNotification(`Copied ${name}`, 'success');
    });
    actions.appendChild(copyBtn);
  }

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'ai-criteria-toggle-btn';
  toggleBtn.title = 'Expand/Collapse';
  toggleBtn.textContent = '▼';
  actions.appendChild(toggleBtn);

  header.appendChild(actions);
  item.appendChild(header);

  // Single text element that smoothly expands from clamped preview to full text
  const textEl = document.createElement('div');
  textEl.className = 'ai-criteria-text';
  textEl.innerHTML = formatAiAnswerText(text);
  item.appendChild(textEl);

  let isExpanded = false;

  const updateChevronVisibility = () => {
    // Don't evaluate before the element is connected and rendered
    if (textEl.clientHeight === 0 && textEl.scrollHeight === 0) return;
    const canExpand = textEl.scrollHeight > textEl.clientHeight + 2;
    if (!canExpand && !isExpanded) {
      toggleBtn.style.display = 'none';
      header.style.cursor = 'default';
      textEl.style.cursor = 'default';
    } else {
      toggleBtn.style.display = '';
      header.style.cursor = 'pointer';
      textEl.style.cursor = 'pointer';
    }
  };

  if (!text || !String(text).trim()) {
    toggleBtn.style.display = 'none';
    header.style.cursor = 'default';
    textEl.style.cursor = 'default';
  } else {
    requestAnimationFrame(updateChevronVisibility);
    setTimeout(updateChevronVisibility, 150);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        if (!isExpanded) updateChevronVisibility();
      });
      ro.observe(textEl);
    }
  }

  const toggle = (e) => {
    e.stopPropagation();
    // If preview is fully displayed without needing expansion, ignore toggle clicks
    if (!isExpanded && textEl.scrollHeight <= textEl.clientHeight + 2) return;

    isExpanded = !isExpanded;
    if (isExpanded) {
      textEl.classList.add('expanded');
      toggleBtn.textContent = '▲';
    } else {
      textEl.classList.remove('expanded');
      toggleBtn.textContent = '▼';
      updateChevronVisibility();
    }
  };

  header.addEventListener('click', toggle);
  textEl.addEventListener('click', toggle);

  return item;
}

function renderAISlots(slots) {
  if (!aiSlotsContainer) return;
  aiSlotsContainer.innerHTML = '';
  updateSlotControlsState(slots.length);

  if (slots.length === 0) return;

  slots.forEach((slot) => {
    const card = window.JobLensUI.createAISlotCardElement(slot, {
      onDelete: (s) => {
        const slotTitle = s.type === 'custom_ask' ? (s.query || 'Custom Question') : (s.templateName || 'Insight');
        showConfirmationModal({
          title: 'Remove AI Insight',
          message: `Are you sure you want to remove "${slotTitle}"?`,
          confirmText: 'Remove',
          confirmClass: 'btn-danger',
          onConfirm: () => removeAISlot(s.id, currentJobId)
        });
      },
      onCopySuccess: (name) => showNotification(`Copied ${name}`, 'success')
    });
    aiSlotsContainer.appendChild(card);
  });
}

function saveAISlotForCurrentJob(slot) {
  if (!currentJobId) return;

  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const results = data[STORAGE_KEY_JOB_RESULTS] || {};

    if (!results[currentJobId]) {
      results[currentJobId] = {
        jobId: currentJobId,
        jobTitle: currentJobDetails?.jobTitle || currentJobTitle,
        companyName: currentJobDetails?.companyName || null,
        location: currentJobDetails?.location || null,
        scannedAt: Date.now(),
        visaMatches: [],
        customMatches: []
      };
    } else {
      // Ensure description is never stored in storage
      delete results[currentJobId].description;
      if (!results[currentJobId].jobTitle && (currentJobDetails?.jobTitle || currentJobTitle)) {
        results[currentJobId].jobTitle = currentJobDetails?.jobTitle || currentJobTitle;
      }
      if (!results[currentJobId].companyName && currentJobDetails?.companyName) {
        results[currentJobId].companyName = currentJobDetails.companyName;
      }
    }

    if (!Array.isArray(results[currentJobId].aiInsights)) {
      results[currentJobId].aiInsights = [];
    }

    // New insights comes on top of the previous one
    results[currentJobId].aiInsights.unshift(slot);

    // Hard limit: maximum 4 insights slots per job
    if (results[currentJobId].aiInsights.length > 4) {
      results[currentJobId].aiInsights = results[currentJobId].aiInsights.slice(0, 4);
    }

    setStorageData({ [STORAGE_KEY_JOB_RESULTS]: results }, () => {
      renderAISlots(results[currentJobId].aiInsights);
      loadSavedJobs();
    });
  });
}

function removeAISlot(slotId, targetJobId = currentJobId) {
  if (!targetJobId) return;

  getStorageData([STORAGE_KEY_JOB_RESULTS], (data) => {
    const results = data[STORAGE_KEY_JOB_RESULTS] || {};
    if (!results[targetJobId] || !Array.isArray(results[targetJobId].aiInsights)) return;

    results[targetJobId].aiInsights = results[targetJobId].aiInsights.filter((s) => s.id !== slotId);

    setStorageData({ [STORAGE_KEY_JOB_RESULTS]: results }, () => {
      showNotification('Insight removed', 'info');
      if (currentJobId && targetJobId === currentJobId) {
        renderAISlots(results[currentJobId].aiInsights);
      }
      loadSavedJobs();
    });
  });
}

// Run AI Insight
async function runAIInsight() {
  if (!currentJobId || !currentJobDetails || !currentJobDetails.description) {
    showNotification('No job description found to analyze', 'error');
    return;
  }

  if (!aiSettings.apiKey || !aiSettings.apiKey.trim()) {
    showNotification('Please configure your API Key in Settings', 'error', 4000);
    showView('settings');
    return;
  }

  if (!aiSettings.model || !aiSettings.model.trim()) {
    showNotification('Please select an AI model in Settings', 'error', 4000);
    showView('settings');
    return;
  }

  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) {
    showNotification('No insight template selected. Please create one in Templates first.', 'error', 4000);
    showView('templates');
    return;
  }

  loadAISlotsForCurrentJob(currentJobId, async (slots) => {
    if (slots.length >= 4) {
      showNotification('Maximum 4 insight slots reached for this job', 'error');
      updateSlotControlsState(slots.length);
      return;
    }

    const origBtnContent = runInsightBtn ? runInsightBtn.innerHTML : '';
    if (runInsightBtn) {
      runInsightBtn.disabled = true;
      runInsightBtn.innerHTML = '<span class="sparkle-icon">⏳</span> <span>Analyzing...</span>';
    }

    try {
      const aiResponse = await window.AIService.generateInsight({
        baseUrl: aiSettings.baseUrl,
        apiKey: aiSettings.apiKey,
        model: aiSettings.model,
        systemInstruction: aiSettings.systemInstruction,
        temperature: aiSettings.temperature,
        maxTokens: aiSettings.maxTokens,
        reasoningEffort: aiSettings.reasoningEffort,
        template: activeTemplate,
        jobDetails: currentJobDetails
      });

      const slot = {
        id: 'slot_' + Date.now(),
        type: 'template',
        templateName: activeTemplate.name,
        timestamp: Date.now(),
        criterias: aiResponse.results || aiResponse,
        requestId: aiResponse.requestId ?? null,
        tokens: {
          input: aiResponse.usage?.promptTokens ?? null,
          output: aiResponse.usage?.completionTokens ?? null,
          total: aiResponse.usage?.totalTokens ?? null,
          reasoning: aiResponse.usage?.reasoningTokens ?? null,
          requestId: aiResponse.requestId ?? null
        }
      };

      saveAISlotForCurrentJob(slot);
      showNotification(`Generated insight: ${activeTemplate.name}`, 'success');
    } catch (err) {
      showNotification(`AI Insight failed: ${err.message}`, 'error', 5000);
    } finally {
      if (runInsightBtn) {
        runInsightBtn.disabled = false;
        runInsightBtn.innerHTML = origBtnContent;
      }
    }
  });
}

if (runInsightBtn) runInsightBtn.addEventListener('click', runAIInsight);

// Submit Ask Anything
if (submitAskBtn) {
  submitAskBtn.addEventListener('click', async () => {
    const query = askQueryInput ? askQueryInput.value.trim() : '';
    if (!query) {
      showNotification('Please enter a question', 'error');
      if (askQueryInput) askQueryInput.focus();
      return;
    }

    if (!aiSettings.apiKey || !aiSettings.apiKey.trim()) {
      showNotification('Please configure your API Key in Settings', 'error', 4000);
      showView('settings');
      return;
    }

    if (!aiSettings.model || !aiSettings.model.trim()) {
      showNotification('Please select an AI model in Settings', 'error', 4000);
      showView('settings');
      return;
    }

    const activeTemplate = getActiveTemplate();

    loadAISlotsForCurrentJob(currentJobId, async (slots) => {
      if (slots.length >= 4) {
        showNotification('Maximum 4 insight slots reached for this job', 'error');
        updateSlotControlsState(slots.length);
        return;
      }

      submitAskBtn.disabled = true;
      submitAskBtn.textContent = 'Thinking...';

      try {
        const aiResponse = await window.AIService.askAnything({
          baseUrl: aiSettings.baseUrl,
          apiKey: aiSettings.apiKey,
          model: aiSettings.model,
          systemInstruction: aiSettings.systemInstruction,
          temperature: aiSettings.temperature,
          maxTokens: aiSettings.maxTokens,
          reasoningEffort: aiSettings.reasoningEffort,
          templateContext: activeTemplate ? activeTemplate.context : '',
          query: query,
          jobDetails: currentJobDetails
        });

        const slot = {
          id: 'slot_' + Date.now(),
          type: 'custom_ask',
          templateName: activeTemplate ? activeTemplate.name : 'Custom Query',
          query: query,
          answer: aiResponse.answer || aiResponse,
          timestamp: Date.now(),
          requestId: aiResponse.requestId ?? null,
          tokens: {
            input: aiResponse.usage?.promptTokens ?? null,
            output: aiResponse.usage?.completionTokens ?? null,
            total: aiResponse.usage?.totalTokens ?? null,
            reasoning: aiResponse.usage?.reasoningTokens ?? null,
            requestId: aiResponse.requestId ?? null
          }
        };

        saveAISlotForCurrentJob(slot);
        if (askQueryInput) askQueryInput.value = '';
        if (askAnythingBox) askAnythingBox.classList.add('search-input-hidden');
        if (toggleAskBtn) toggleAskBtn.classList.remove('active');
        showNotification('Answer received', 'success');
      } catch (err) {
        showNotification(`Ask failed: ${err.message}`, 'error', 5000);
      } finally {
        submitAskBtn.disabled = false;
        submitAskBtn.textContent = 'Ask AI';
      }
    });
  });
}

// Auto AI Insight on Job Opening
function triggerAutoInsightIfEligible() {
  if (!aiSettings.autoInsight || isFullListScanning) return;
  if (!aiSettings.apiKey || !aiSettings.model || !currentJobId || !currentJobDetails) return;

  const activeTemplate = getActiveTemplate();
  if (!activeTemplate) return;

  loadAISlotsForCurrentJob(currentJobId, (slots) => {
    if (slots.length >= 4) return;
    const alreadyEvaluated = slots.some(
      (s) => s.type === 'template' && s.templateName === activeTemplate.name
    );
    if (!alreadyEvaluated) {
      runAIInsight();
    }
  });
}

function renderSavedJobAIHistory(container, aiInsights, jobId) {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(aiInsights) || aiInsights.length === 0) return;

  aiInsights.forEach((slot) => {
    const card = window.JobLensUI.createAISlotCardElement(slot, {
      onDelete: (s) => {
        const slotTitle = s.type === 'custom_ask' ? (s.query || 'Custom Question') : (s.templateName || 'Insight');
        showConfirmationModal({
          title: 'Remove AI Insight',
          message: `Are you sure you want to remove "${slotTitle}"?`,
          confirmText: 'Remove',
          confirmClass: 'btn-danger',
          onConfirm: () => removeAISlot(s.id, jobId)
        });
      },
      onCopySuccess: (name) => showNotification(`Copied ${name}`, 'success')
    });
    container.appendChild(card);
  });
}

// Keep side panel UI synchronized with chrome.storage changes (e.g. from background scans or other tabs)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes[STORAGE_KEY_JOB_RESULTS]) {
        const newJobs = changes[STORAGE_KEY_JOB_RESULTS].newValue || {};
        renderSavedJobs(newJobs);
        if (currentJobId && newJobs[currentJobId]) {
          renderAISlots(newJobs[currentJobId].aiInsights || []);
        }
      }
      if (changes[STORAGE_KEY_TEMPLATES]) {
        insightTemplates = changes[STORAGE_KEY_TEMPLATES].newValue || [];
        updateActiveTemplateUI();
      }
      if (changes[STORAGE_KEY_ACTIVE_TEMPLATE]) {
        activeTemplateId = changes[STORAGE_KEY_ACTIVE_TEMPLATE].newValue || null;
        updateActiveTemplateUI();
      }
    }
  });
}
