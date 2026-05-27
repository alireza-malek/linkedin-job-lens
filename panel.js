function sendToContent(type, payload) {
  // Get current tab ID and include it in the message
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    chrome.runtime.sendMessage({
      type: 'PANEL_TO_CONTENT',
      payload: { type, ...payload, tabId }
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
    // Only show if still in the scanning state
    if (summaryEl.textContent.includes('Scanning job description')) {
      summaryEl.innerHTML = 'Scanning job description and badges...<div style="margin-top: 6px; font-weight: 400;">If it takes longer than expected, reload the page.</div>';
    }
  }, 10000);
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
  if (isLinkedInTab() && isJobPage()) {
    setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
  }
});

chrome.tabs.onActivated.addListener(() => {
  updateActiveTab(() => {
    renderCurrentTabState();
    if (isLinkedInTab() && isJobPage()) {
      setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
    }
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && tabId === currentTabId) {
    updateActiveTab(() => {
      renderCurrentTabState();
      if (isLinkedInTab() && isJobPage()) {
        setTimeout(() => sendToContent('REQUEST_SCAN', {}), 300);
      }
    });
  }
});

// Load saved keywords, seed with defaults if empty
chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: ['visaKeywords', 'customKeywords'] }, (resp) => {
  const data = (resp && resp.data) || {};
  const loadedVisa = Array.isArray(data.visaKeywords) ? data.visaKeywords : [];
  const loadedCustom = Array.isArray(data.customKeywords) ? data.customKeywords : [];
  visaKeywords = loadedVisa.length ? loadedVisa : DEFAULT_VISA_KEYWORDS.slice();
  customKeywords = loadedCustom;
  renderKeywords();
});

function persistKeywords() {
  chrome.runtime.sendMessage({ type: 'STORAGE_SET', data: { visaKeywords, customKeywords } }, () => {
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

// Clear any displayed results
function clearResults() {
  summaryEl.textContent = '';
  matchListEl.innerHTML = '';
  copyBtn.classList.add('search-input-hidden');
  jobTitleContainer.classList.add('search-input-hidden');
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
    summaryEl.innerHTML = 'Navigate to <a href="https://www.linkedin.com/jobs/" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">LinkedIn Jobs</a> <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-left: 1px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg> to use this tool';
    matchListEl.innerHTML = '';
    copyBtn.classList.add('search-input-hidden');
    jobTitleContainer.classList.add('search-input-hidden');
    return;
  }

  if (!isJob) {
    // On LinkedIn but not on job pages
    clearScanTimeout();
    summaryEl.textContent = 'Navigate to job listings or job details to scan';
    matchListEl.innerHTML = '';
    copyBtn.classList.add('search-input-hidden');
    jobTitleContainer.classList.add('search-input-hidden');
    return;
  }

  // On LinkedIn job page - show scanning state until results arrive
  summaryEl.textContent = 'Scanning job description and badges...';
  matchListEl.innerHTML = '';
  copyBtn.classList.add('search-input-hidden');
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

    renderMatches(msg.data);

    // Always refresh scanned jobs list when a new scan completes
    loadSavedJobs();
  }

  // Handle copy feedback
  if (msg.type === 'COPY_SUCCESS' && msg.data) {
    const chars = msg.data.length;
    showNotification(`✅ Copied ${chars} characters to clipboard`, 'success');
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

function renderMatches({ hasJD, visaMatches = [], customMatches = [], jobTitle = null, companyName = null }) {
  // Clear the "Scanning..." timeout since results have arrived
  clearScanTimeout();

  if (hasJD) {
    copyBtn.classList.remove('search-input-hidden');
  } else {
    copyBtn.classList.add('search-input-hidden');
  }

  // Show/hide job title and company
  if (hasJD && jobTitle) {
    jobTitleContainer.classList.remove('search-input-hidden');
    jobTitleDisplay.textContent = jobTitle;
    if (companyNameDisplay) {
      if (companyName) {
        companyNameDisplay.textContent = companyName;
        companyNameDisplay.classList.remove('search-input-hidden');
      } else {
        companyNameDisplay.textContent = 'Unknown Company';
        companyNameDisplay.classList.remove('search-input-hidden');
      }
    }
  } else {
    jobTitleContainer.classList.add('search-input-hidden');
    if (companyNameDisplay) {
      companyNameDisplay.textContent = '';
      companyNameDisplay.classList.add('search-input-hidden');
    }
  }

  const visaTotal = visaMatches.reduce((sum, m) => sum + m.count, 0);
  const customTotal = customMatches.reduce((sum, m) => sum + m.count, 0);

  summaryEl.textContent = `Visa: ${visaTotal} match${visaTotal === 1 ? '' : 'es'} | Custom: ${customTotal} match${customTotal === 1 ? '' : 'es'}`;
  matchListEl.innerHTML = '';

  if (visaTotal === 0 && customTotal === 0) {
    matchListEl.innerHTML = '<div class="muted" style="padding: 16px; text-align: center;">No matches found</div>';
    return;
  }

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

  // Create consistent banner-like UI
  const banner = document.createElement('div');
  banner.className = 'jl-results-banner';

  const content = document.createElement('div');
  content.className = 'jl-banner-content';

  const titleRow = document.createElement('div');
  titleRow.className = 'jl-banner-title-row';
  titleRow.textContent = '🔍 Keywords Found 🔍';
  content.appendChild(titleRow);

  if (customTotal > 0) {
    const row = document.createElement('div');
    row.className = 'jl-banner-row';

    const label = document.createElement('span');
    label.className = 'jl-banner-label';
    label.textContent = 'Matches:';

    const keywords = document.createElement('span');
    keywords.className = 'jl-banner-keywords';

    customKeywordsList.forEach(item => {
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'jl-banner-keyword';
      keywordSpan.textContent = `${item.keyword}`;
      if (item.anchorId) {
        keywordSpan.style.cursor = 'pointer';
        keywordSpan.setAttribute('data-anchor-id', item.anchorId);
        keywordSpan.addEventListener('click', () => {
          sendToContent('SCROLL_TO_MATCH', { anchorId: item.anchorId });
        });
      }
      keywords.appendChild(keywordSpan);
    });

    row.appendChild(label);
    row.appendChild(keywords);
    content.appendChild(row);
  }

  if (visaTotal > 0) {
    const row = document.createElement('div');
    row.className = 'jl-banner-row';

    const label = document.createElement('span');
    label.className = 'jl-banner-label';
    label.textContent = 'Visa:';

    const keywords = document.createElement('span');
    keywords.className = 'jl-banner-keywords';

    visaKeywordsList.forEach(item => {
      const keywordSpan = document.createElement('span');
      keywordSpan.className = 'jl-banner-keyword';
      keywordSpan.textContent = `${item.keyword}`;
      if (item.anchorId) {
        keywordSpan.style.cursor = 'pointer';
        keywordSpan.setAttribute('data-anchor-id', item.anchorId);
        keywordSpan.addEventListener('click', () => {
          sendToContent('SCROLL_TO_MATCH', { anchorId: item.anchorId });
        });
      }
      keywords.appendChild(keywordSpan);
    });

    row.appendChild(label);
    row.appendChild(keywords);
    content.appendChild(row);
  }

  banner.appendChild(content);
  matchListEl.appendChild(banner);
}

const STORAGE_KEY_JOB_RESULTS = 'jl_job_scan_results';

function loadSavedJobs() {
  chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: [STORAGE_KEY_JOB_RESULTS] }, (resp) => {
    const data = (resp && resp.data) || {};
    const savedJobs = data[STORAGE_KEY_JOB_RESULTS] || {};
    renderSavedJobs(savedJobs);
  });
}

function renderSavedJobs(savedJobs) {
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
    savedJobsListEl.innerHTML = `<div class="muted" style="padding: 32px; text-align: center;">No jobs match "${currentSearchTerm}".<br>Try a different search term.</div>`;
    return;
  }

  jobs.forEach(([jobId, job]) => {
    const visaMatchCount = (job.visaMatches || []).reduce((sum, m) => sum + m.count, 0);
    const customMatchCount = (job.customMatches || []).reduce((sum, m) => sum + m.count, 0);

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
      chrome.runtime.sendMessage({ type: 'UNSAVE_JOB', jobId: jobId }, () => {
        showNotification('Job removed', 'info');
        loadSavedJobs();
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

    const visaBadge = document.createElement('span');
    visaBadge.className = 'saved-badge';
    visaBadge.textContent = visaMatchCount > 0 ? '✓ Visa' : '✗ Visa';
    visaBadge.style.background = visaMatchCount > 0 ? '#dcfce7' : '#fef2f2';
    visaBadge.style.color = visaMatchCount > 0 ? '#166534' : '#991b1b';
    visaBadge.style.padding = '2px 6px';
    visaBadge.style.borderRadius = '4px';
    visaBadge.style.fontSize = '11px';
    visaBadge.style.fontWeight = '500';
    visaBadge.style.whiteSpace = 'nowrap';

    const customBadge = document.createElement('span');
    customBadge.className = 'saved-badge';
    customBadge.textContent = customMatchCount > 0 ? `${customMatchCount}x Match` : '✗ Match';
    customBadge.style.background = customMatchCount > 0 ? '#dcfce7' : '#fef2f2';
    customBadge.style.color = customMatchCount > 0 ? '#166534' : '#991b1b';
    customBadge.style.padding = '2px 6px';
    customBadge.style.borderRadius = '4px';
    customBadge.style.fontSize = '11px';
    customBadge.style.fontWeight = '500';
    customBadge.style.whiteSpace = 'nowrap';

    badges.appendChild(visaBadge);
    badges.appendChild(customBadge);

    bottomRow.appendChild(companyName);
    bottomRow.appendChild(badges);

    card.appendChild(topRow);
    card.appendChild(bottomRow);
    savedJobsListEl.appendChild(card);
  });
}

// Initialize saved jobs on load
loadSavedJobs();

// Menu toggle functionality
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isVisible = menuDropdown.style.display !== 'none';
  menuDropdown.style.display = isVisible ? 'none' : 'block';
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

  chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: [STORAGE_KEY_JOB_RESULTS] }, (resp) => {
    const data = (resp && resp.data) || {};
    const savedJobs = data[STORAGE_KEY_JOB_RESULTS] || {};

    if (Object.keys(savedJobs).length === 0) {
      showNotification('No jobs to export', 'info');
      return;
    }

    // Create JSON string
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
      const importedJobs = JSON.parse(event.target.result);

      if (!importedJobs || typeof importedJobs !== 'object' || Array.isArray(importedJobs)) {
        showNotification('Invalid JSON file format. Expected an object', 'error');
        e.target.value = '';
        return;
      }

      // Merge with existing jobs (imported jobs take precedence for same jobId)
      chrome.runtime.sendMessage({ type: 'STORAGE_GET', keys: [STORAGE_KEY_JOB_RESULTS] }, (resp) => {
        const data = (resp && resp.data) || {};
        const existingJobs = data[STORAGE_KEY_JOB_RESULTS] || {};

        // Merge jobs (imported overwrite existing)
        const mergedJobs = { ...existingJobs, ...importedJobs };

        // Save merged jobs
        chrome.runtime.sendMessage({ type: 'STORAGE_SET', data: { [STORAGE_KEY_JOB_RESULTS]: mergedJobs } }, () => {
          const importedCount = Object.keys(importedJobs).length;
          const newCount = Object.keys(importedJobs).filter(id => !existingJobs[id]).length;
          showNotification(`Imported ${importedCount} job(s) (${newCount} new)`, 'success');
          loadSavedJobs();
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
