/**
 * Content script: scans LinkedIn job descriptions, highlights visa/relocation keywords,
 * sends matches to side panel, and badges left-pane job cards with automatic full scanning.
 */

console.log('🔍 LinkedIn Job Lens extension loaded.');

const DEFAULT_VISA_KEYWORDS = [
  'visa', 'sponsorship', 'work permit',
  'employment visa', 'h1b', 'h-1b',
  'relocation', 'relocate', 'sponsor', 'sponsored', 'sponsoring', 'sponsorable',
  'blue card', 'immigration',
];

// State management
let currentVisaKeywords = null;
let currentCustomKeywords = null;
let lastScan = { matches: [], totalCount: 0 };
let jobDescriptionCache = new Map();
let scanningJobs = new Set();
let autoScanQueue = [];
let isAutoScanning = false;
let isFullListScanning = false; // Track full list scan state (per-tab)
let currentTabId = null; // Track current tab ID

// Constants
const MAX_CONCURRENT_AUTO_SCANS = 2;
const MAX_STORED_JOBS = 1000;
const SCAN_DEBOUNCE_MS = 1000;
const URL_SCAN_RESET_MS = 5000;
const INITIAL_LOAD_DELAY_MS = 1000;
const RETRY_DELAY_MS = 2000;
const RETRY_DELAY_MS_LONG = 3000;
const MIN_DESCRIPTION_LENGTH = 100;

// ============================================================================
// DOM OBSERVATION (Simplified - only URL and click based)
// ============================================================================

function setupObserver() {
  // No more MutationObserver - we rely on URL changes and click events only
  // This prevents unwanted scans when LinkedIn's DOM changes for internal reasons
}

// Extract job ID from URL - handles both patterns:
// 1. /jobs/view/123456 (full page view)
// 2. currentJobId=123456 (two-pane view)
function extractJobIdFromUrl(url = window.location.href) {
  // Check for /jobs/view/ pattern
  const viewMatch = url.match(/\/jobs\/view\/(\d+)/);
  if (viewMatch) return viewMatch[1];

  // Check for currentJobId parameter
  const currentJobIdMatch = url.match(/[?&]currentJobId=(\d+)/);
  if (currentJobIdMatch) return currentJobIdMatch[1];

  return null;
}

// Track active job card to detect manual clicks in two-pane view
let lastActiveJobId = null;
let scanDebounceTimer = null;

function checkActiveCardChange() {
  // Skip if URL change handler is already processing
  if (urlScanInProgress || currentJobScanInProgress) return;

  // Check for active card in two-pane view
  const activeCard = document.querySelector(
    '[data-job-id].jobs-search-results-list__list-item--active, ' +
    '[data-job-id][aria-current="page"]'
  );
  const activeJobId = activeCard?.getAttribute('data-job-id');

  // Also check URL for both full-page and two-pane view
  const urlJobId = extractJobIdFromUrl();
  const currentJobId = urlJobId || activeJobId;

  if (currentJobId && currentJobId !== lastActiveJobId) {
    lastActiveJobId = currentJobId;
    // Debounce to avoid duplicate scans
    clearTimeout(scanDebounceTimer);
    scanDebounceTimer = setTimeout(() => {
      checkAndUpdateBadgesForOpenJob();
    }, SCAN_DEBOUNCE_MS);
  }
}

// Listen for URL changes (LinkedIn uses pushState for navigation)
let lastUrl = window.location.href;
let lastUrlJobId = null;
let urlScanInProgress = false;

function checkUrlChange() {
  if (urlScanInProgress) return; // Prevent concurrent URL-triggered scans

  const currentUrl = window.location.href;
  const currentJobId = extractJobIdFromUrl(currentUrl);

  // Check if URL changed OR job ID in URL changed
  if (currentUrl !== lastUrl || currentJobId !== lastUrlJobId) {
    lastUrl = currentUrl;
    lastUrlJobId = currentJobId;
    lastActiveJobId = null; // Reset to trigger check

    if (currentJobId && !currentJobScanInProgress) {
      urlScanInProgress = true;
      // Debounce to avoid duplicate scans (checkActiveCardChange might also trigger)
      clearTimeout(scanDebounceTimer);
      scanDebounceTimer = setTimeout(() => {
        checkAndUpdateBadgesForOpenJob();
        setTimeout(() => { urlScanInProgress = false; }, URL_SCAN_RESET_MS);
      }, SCAN_DEBOUNCE_MS);
    }
  }
}

// Override pushState and replaceState to detect URL changes
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
  originalPushState.apply(history, args);
  checkUrlChange();
};

history.replaceState = function (...args) {
  originalReplaceState.apply(history, args);
  checkUrlChange();
};

window.addEventListener('popstate', checkUrlChange);

// ============================================================================
// STORAGE MANAGEMENT
// ============================================================================

// Unified storage key for job scan results
const STORAGE_KEY_JOB_RESULTS = 'jl_job_scan_results';

// Extract job title from DOM
function extractJobTitle() {
  const selectors = [
    '.jobs-details-top-card__job-title',
    'h1[data-test-id="job-details-title"]',
    'h1.jobs-details-top-card__job-title',
    '.job-details-jobs-unified-top-card__job-title',
    // New LinkedIn full-page layout: title is a <p> near the top of the job header
    'p[class*="_6ffc9cf5"]',
    // Generic fallbacks
    '[data-view-name="job-details"] h1',
    'main h1',
    'h1'
  ];
  for (const sel of selectors) {
    const node = document.querySelector(sel);
    if (node) {
      const title = (node.innerText || node.textContent || '').trim();
      if (title && title.length > 0) return title;
    }
  }

  // New LinkedIn layout (AI search detail & full-page views)
  // Title uses class b46cb6f5 in current LinkedIn version
  const newLayoutTitle = document.querySelector('p.b46cb6f5');
  if (newLayoutTitle) {
    const title = (newLayoutTitle.innerText || newLayoutTitle.textContent || '').trim();
    if (title && title.length > 0) return title;
  }

  // Fallback - walk up from company aria-label to find sibling containing title
  const companyLabelEl = document.querySelector('[aria-label^="Company,"]');
  if (companyLabelEl) {
    let el = companyLabelEl;
    for (let i = 0; i < 10 && el; i++) {
      const next = el.nextElementSibling;
      if (next) {
        const p = next.querySelector('p');
        if (p) {
          const text = (p.innerText || p.textContent || '').trim();
          // Title text doesn't contain "·" separator (location/posted lines do)
          if (text && text.length > 3 && !text.includes('·')) {
            return text;
          }
        }
      }
      el = el.parentElement;
      if (!el || el.tagName === 'BODY') break;
    }
  }

  return null;
}

// Extract company name from DOM
function extractCompanyName() {
  const selectors = [
    '.jobs-details-top-card__company-name',
    '.jobs-details-top-card__company-info a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-details-top-card__primary-description-without-tagline a',
    '[data-test-id="job-details-company-name"]',
    '.jobs-company__box a'
  ];
  for (const sel of selectors) {
    const node = document.querySelector(sel);
    if (node) {
      const company = (node.innerText || node.textContent || '').trim();
      if (company && company.length > 0) return company;
    }
  }

  // AI job search layout - company name from aria-label="Company, {name}."
  const companyLabelEl = document.querySelector('[aria-label^="Company,"]');
  if (companyLabelEl) {
    const label = companyLabelEl.getAttribute('aria-label');
    const match = label.match(/^Company,\s*(.+?)\.?\s*$/);
    if (match && match[1]) return match[1].trim();
  }

  // Fallback for new LinkedIn layout:
  // Look for visible links that point to a company page, and pick the one nearest the top.
  try {
    const linkNodes = Array.from(
      document.querySelectorAll(
        'a[href*="linkedin.com/company/"], a[href^="https://www.linkedin.com/company/"], a[href^="/company/"]'
      )
    );

    let best = null;
    for (const link of linkNodes) {
      const text = (link.innerText || link.textContent || '').trim();
      if (!text) continue;

      // Skip if link is not visible
      const rect = link.getBoundingClientRect();
      if (!rect || rect.height === 0 || rect.width === 0) continue;

      if (!best || rect.top < best.top) {
        best = { top: rect.top, text };
      }
    }

    if (best && best.text) {
      return best.text;
    }
  } catch (e) {
    // Non-fatal; just fall through to null
  }

  return null;
}

// Save job scan result to storage
async function saveJobScanResult(jobId, description, visaMatches, customMatches, jobTitle, companyName) {
  return new Promise((resolve, reject) => {
    try {
      const result = {
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        visaMatches: visaMatches.map(m => ({ key: m.key, count: m.count })),
        customMatches: customMatches.map(m => ({ key: m.key, count: m.count })),
        scannedAt: Date.now()
      };

      chrome.storage.local.get([STORAGE_KEY_JOB_RESULTS], (data) => {
        const results = data[STORAGE_KEY_JOB_RESULTS] || {};
        results[jobId] = result;
        // Keep only last N jobs to avoid storage limits
        const entries = Object.entries(results);
        if (entries.length > MAX_STORED_JOBS) {
          entries.sort((a, b) => (b[1].scannedAt || 0) - (a[1].scannedAt || 0));
          const trimmed = Object.fromEntries(entries.slice(0, MAX_STORED_JOBS));
          chrome.storage.local.set({ [STORAGE_KEY_JOB_RESULTS]: trimmed }, () => {
            if (chrome.runtime.lastError) {
              console.error('Failed to save trimmed job results to storage:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        } else {
          chrome.storage.local.set({ [STORAGE_KEY_JOB_RESULTS]: results }, () => {
            if (chrome.runtime.lastError) {
              console.error('Failed to save job results to storage:', chrome.runtime.lastError);
              reject(chrome.runtime.lastError);
            } else {
              resolve();
            }
          });
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Get cached job scan result
async function getCachedJobResult(jobId) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([STORAGE_KEY_JOB_RESULTS], (data) => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to read from storage:', chrome.runtime.lastError);
          resolve(null);
          return;
        }
        const results = data[STORAGE_KEY_JOB_RESULTS] || {};
        resolve(results[jobId] || null);
      });
    } catch (error) {
      console.warn('Storage access error:', error);
      resolve(null);
    }
  });
}

// Check if cached result exists
function isCacheValid(cachedResult) {
  return !!cachedResult && cachedResult.scannedAt;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Load cached job results and update badges for visible job cards
 */
async function loadCachedResultsAndUpdateBadges() {
  // Wait a bit for LinkedIn to render job cards
  await new Promise(resolve => setTimeout(resolve, INITIAL_LOAD_DELAY_MS));

  const cards = findJobCards();
  if (!cards || cards.length === 0) {
    // Retry after a delay for lazy-loaded cards
    setTimeout(() => {
      const retryCards = findJobCards();
      retryCards.forEach(card => {
        const jobId = extractJobId(card);
        if (jobId) {
          updateBadgeFromStorage(card, jobId);
        }
      });
    }, RETRY_DELAY_MS);
    return;
  }

  // Update badges for all visible cards
  cards.forEach(card => {
    const jobId = extractJobId(card);
    if (jobId) {
      updateBadgeFromStorage(card, jobId);
    }
  });

  // Retry for lazy-loaded cards that appear later
  setTimeout(() => {
    const retryCards = findJobCards();
    retryCards.forEach(card => {
      const jobId = extractJobId(card);
      if (jobId) {
        updateBadgeFromStorage(card, jobId);
      }
    });
  }, RETRY_DELAY_MS_LONG);
}

function init() {
  // Initialize URL tracking
  lastUrl = window.location.href;
  lastUrlJobId = extractJobIdFromUrl();

  chrome.storage.local.get(['visaKeywords', 'customKeywords'], ({ visaKeywords, customKeywords }) => {
    const useVisaDefaults = !Array.isArray(visaKeywords) || visaKeywords.length === 0;
    currentVisaKeywords = normalizeKeywords(useVisaDefaults ? DEFAULT_VISA_KEYWORDS : visaKeywords);
    currentCustomKeywords = normalizeKeywords(Array.isArray(customKeywords) ? customKeywords : []);

    // Load cached results and update badges
    loadCachedResultsAndUpdateBadges();

    // Check for initially open job with multiple attempts
    const checkInitialJob = () => {
      const initialJobId = extractJobIdFromUrl();
      if (initialJobId) {
        checkAndUpdateBadgesForOpenJob();
      } else {
        // Try again in case the page is still loading
        setTimeout(() => {
          const retryJobId = extractJobIdFromUrl();
          if (retryJobId) {
            checkAndUpdateBadgesForOpenJob();
          }
        }, 3000);
      }
    };

    setTimeout(checkInitialJob, 2000);
  });

  // Listen for storage changes to reload keywords
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      if (changes.visaKeywords) {
        const newKeywords = changes.visaKeywords.newValue;
        currentVisaKeywords = normalizeKeywords(
          Array.isArray(newKeywords) && newKeywords.length > 0
            ? newKeywords
            : DEFAULT_VISA_KEYWORDS
        );
      }
      if (changes.customKeywords) {
        const newKeywords = changes.customKeywords.newValue;
        currentCustomKeywords = normalizeKeywords(Array.isArray(newKeywords) ? newKeywords : []);
      }
    }
  });

  // Check on job link clicks (main trigger for scanning)
  document.addEventListener('click', (e) => {
    const jobLink = e.target.closest('a[href*="/jobs/view/"]');
    const aiJobCard = e.target.closest('div[role="button"][componentkey^="job-card-component-ref-"]');
    if (jobLink || aiJobCard) {
      // Trigger URL/card change checks after a delay to catch the URL update
      // These functions will handle scanning (no need to call checkAndUpdateBadgesForOpenJob directly)
      setTimeout(() => {
        checkUrlChange();
        checkActiveCardChange();
      }, 1500);
    }
  }, true);

  // Periodic fallback check for URL/job changes (every 3 seconds)
  // This helps catch navigation that might be missed by other methods
  setInterval(() => {
    checkUrlChange();
    checkActiveCardChange();
  }, 3000);

  // Watch for new job cards being added to the DOM (LinkedIn lazy-loads cards)
  const observer = new MutationObserver((mutations) => {
    let shouldUpdateBadges = false;
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this is a job card or contains job cards
          if (node.querySelector && (
            node.querySelector('[data-occludable-job-id]') ||
            node.querySelector('[data-job-id]') ||
            node.querySelector('a[href*="/jobs/view/"]') ||
            node.querySelector('[componentkey^="job-card-component-ref-"]')
          )) {
            shouldUpdateBadges = true;
          }
          // Also check if the node itself is a job card
          if (node.getAttribute && (
            node.getAttribute('data-occludable-job-id') ||
            node.getAttribute('data-job-id') ||
            (node.getAttribute('componentkey') || '').startsWith('job-card-component-ref-')
          )) {
            shouldUpdateBadges = true;
          }
        }
      });
    });

    if (shouldUpdateBadges) {
      // Debounce badge updates to avoid excessive calls
      setTimeout(() => {
        const cards = findJobCards();
        cards.forEach(card => {
          const jobId = extractJobId(card);
          if (jobId) {
            // Only update if badge doesn't exist yet (to avoid duplicate work)
            const existingBadge = card.querySelector('.jl-badge-container');
            if (!existingBadge) {
              updateBadgeFromStorage(card, jobId);
            }
          }
        });
      }, 500);
    }
  });

  // Observe the main container where job cards are rendered
  const jobListContainer = document.querySelector('.scaffold-layout__list-container') ||
    document.querySelector('.jobs-search-results-list') ||
    document.querySelector('.scaffold-layout__list') ||
    document.querySelector('[data-testid="lazy-column"]') ||
    document.body;

  if (jobListContainer) {
    observer.observe(jobListContainer, {
      childList: true,
      subtree: true
    });
  }
}

init();

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return;

  // Update tab ID from sender
  if (sender && sender.tab && sender.tab.id) {
    currentTabId = sender.tab.id;
  }

  if (msg.type === 'REQUEST_SCAN') {
    // Reload keywords before scanning to ensure we use the latest
    chrome.storage.local.get(['visaKeywords', 'customKeywords'], ({ visaKeywords, customKeywords }) => {
      const useVisaDefaults = !Array.isArray(visaKeywords) || visaKeywords.length === 0;
      currentVisaKeywords = normalizeKeywords(useVisaDefaults ? DEFAULT_VISA_KEYWORDS : visaKeywords);
      currentCustomKeywords = normalizeKeywords(Array.isArray(customKeywords) ? customKeywords : []);

      checkAndUpdateBadgesForOpenJob();
    });
  }

  if (msg.type === 'START_FULL_LIST_SCAN') {
    // Only start if this is for the current tab
    if (!currentTabId || msg.tabId === currentTabId || !msg.tabId) {
      startFullListScan();
    }
  }

  if (msg.type === 'STOP_FULL_LIST_SCAN') {
    // Only stop if this is for the current tab
    if (!currentTabId || msg.tabId === currentTabId || !msg.tabId) {
      stopFullListScan();
    }
  }

  if (msg.type === 'SCROLL_TO_MATCH' && msg.anchorId) {
    const el = document.getElementById(msg.anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  if (msg.type === 'SAVE_JOB' && msg.jobId) {
    // Jobs are automatically saved when scanned
  }

  if (msg.type === 'COPY_JOB_DESCRIPTION') {
    const text = extractJobDescriptionText();
    if (text) {
      // Use a temporary textarea element to copy text (more reliable than clipboard API)
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.select();
      textarea.setSelectionRange(0, text.length);

      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
          chrome.runtime.sendMessage({
            type: 'COPY_SUCCESS',
            data: { success: true, length: text.length }
          });
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (error) {
        document.body.removeChild(textarea);
        // Fallback to clipboard API
        navigator.clipboard.writeText(text)
          .then(() => {
            chrome.runtime.sendMessage({
              type: 'COPY_SUCCESS',
              data: { success: true, length: text.length }
            });
          })
          .catch((clipboardError) => {
            console.warn('Failed to copy to clipboard:', clipboardError);
            chrome.runtime.sendMessage({
              type: 'COPY_ERROR',
              data: { success: false, error: clipboardError.message }
            });
          });
      }
    } else {
      chrome.runtime.sendMessage({
        type: 'COPY_ERROR',
        data: { success: false, error: 'No job description found to copy' }
      });
    }
  }
});

async function updateBadgeFromStorage(card, jobId) {
  if (!card || !jobId) return;

  const cached = await getCachedJobResult(jobId);

  if (cached && isCacheValid(cached)) {
    ensureBadgeExists(card, jobId);
    const hasVisaMatch = cached.visaMatches && cached.visaMatches.length > 0;
    const customMatchCount = cached.customMatches ? cached.customMatches.reduce((sum, m) => sum + m.count, 0) : 0;
    updateBadgeForCard(card, hasVisaMatch, customMatchCount);
    return;
  }

  // No cache - check if job is open or has quick matches
  const urlJobId = extractJobIdFromUrl();
  const activeCard = document.querySelector(
    '[data-job-id].jobs-search-results-list__list-item--active, ' +
    '[data-job-id][aria-current="page"]'
  );
  const activeJobId = activeCard?.getAttribute('data-job-id');
  const isOpen = urlJobId === jobId || activeJobId === jobId;

  if (isOpen) {
    ensureBadgeExists(card, jobId);
    const visaBadge = card.querySelector('.jl-badge-visa');
    const customBadge = card.querySelector('.jl-badge-custom');
    if (visaBadge) {
      visaBadge.classList.remove('jl-badge--pending', 'jl-badge--confirmed', 'jl-badge--none', 'jl-badge--error');
      visaBadge.classList.add('jl-badge--loading');
      visaBadge.textContent = 'Scanning...';
    }
    if (customBadge) {
      customBadge.classList.remove('jl-badge--pending', 'jl-badge--confirmed', 'jl-badge--none', 'jl-badge--error');
      customBadge.classList.add('jl-badge--loading');
      customBadge.textContent = 'Scanning...';
    }
    return;
  }

  // Check for quick matches in card preview
  const cardText = (card.innerText || '').toLowerCase();
  const visaKws = currentVisaKeywords || DEFAULT_VISA_KEYWORDS;
  const customKws = currentCustomKeywords || [];
  const visaQuickMatches = scanTextForKeywords(cardText, visaKws);
  const customQuickMatches = scanTextForKeywords(cardText, customKws);
  const hasVisaQuickMatch = visaQuickMatches.length > 0;
  const hasCustomQuickMatch = customQuickMatches.length > 0;

  if (hasVisaQuickMatch || hasCustomQuickMatch) {
    ensureBadgeExists(card, jobId);
    const visaBadge = card.querySelector('.jl-badge-visa');
    const customBadge = card.querySelector('.jl-badge-custom');

    if (visaBadge && hasVisaQuickMatch) {
      visaBadge.classList.remove('jl-badge--pending', 'jl-badge--loading', 'jl-badge--none', 'jl-badge--error');
      visaBadge.classList.add('jl-badge--confirmed');
      visaBadge.textContent = '✓ Visa';
      visaBadge.title = 'Sponsorship-related term found in job preview';
    }

    if (customBadge && hasCustomQuickMatch) {
      const customCount = customQuickMatches.reduce((sum, m) => sum + m.count, 0);
      customBadge.classList.remove('jl-badge--pending', 'jl-badge--loading', 'jl-badge--none', 'jl-badge--error');
      customBadge.classList.add('jl-badge--confirmed');
      customBadge.textContent = `${customCount}x Match`;
      customBadge.title = 'Custom keywords found in job preview';
    }
    return;
  }

  // No cache, not open, and no quick matches - remove badges if they exist
  const badgeContainer = card.querySelector('.jl-badge-container');
  if (badgeContainer) {
    badgeContainer.remove();
  }
}

// ============================================================================
// FULL LIST SCANNING
// ============================================================================

async function startFullListScan() {
  if (isFullListScanning) return;
  isFullListScanning = true;

  try {
    while (isFullListScanning) {
      const cards = findJobCards();
      if (!cards || cards.length === 0) {
        // Try scrolling to load more
        await scrollToLoadMore();
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }

      // Find unscanned jobs
      const unscannedJobs = [];
      for (const card of cards) {
        const jobId = extractJobId(card);
        if (!jobId) continue;

        // Check cache first
        const cached = await getCachedJobResult(jobId);
        if (cached && isCacheValid(cached)) {
          // Update badge from storage
          await updateBadgeFromStorage(card, jobId);
          continue;
        }

        // Not cached and not currently scanning
        if (!scanningJobs.has(jobId) && !jobDescriptionCache.has(jobId)) {
          unscannedJobs.push({ jobId, card });
        }
      }

      if (unscannedJobs.length === 0) {
        // All jobs scanned, try to go to next page
        const nextPageClicked = await goToNextPage();
        if (!nextPageClicked) {
          // No more pages, stop scanning
          stopFullListScan();
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }

      // Scan jobs in batches
      for (const { jobId, card } of unscannedJobs.slice(0, MAX_CONCURRENT_AUTO_SCANS)) {
        if (!isFullListScanning) break;

        // Scroll card into view
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(resolve => setTimeout(resolve, 500));

        await autoScanJob(jobId);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Scroll to load more if near bottom
      await scrollToLoadMore();
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.warn('Full list scan error:', error);
    stopFullListScan();
  }
}

function stopFullListScan() {
  isFullListScanning = false;
  chrome.runtime.sendMessage({
    type: 'FULL_LIST_SCAN_STOPPED',
    tabId: currentTabId
  }).catch(() => { });
}

// Scroll to load more jobs (LinkedIn lazy loads)
async function scrollToLoadMore() {
  const scrollContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-container, [data-testid="lazy-column"]') || window;
  const scrollHeight = scrollContainer === window ? document.documentElement.scrollHeight : scrollContainer.scrollHeight;
  const scrollTop = scrollContainer === window ? window.pageYOffset : scrollContainer.scrollTop;
  const clientHeight = scrollContainer === window ? window.innerHeight : scrollContainer.clientHeight;

  // If near bottom (within 500px), scroll down
  if (scrollHeight - scrollTop - clientHeight < 500) {
    scrollContainer.scrollTo({
      top: scrollHeight,
      behavior: 'smooth'
    });
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
}

// Try to go to next page
async function goToNextPage() {
  // Look for "Next" button
  const nextButton = document.querySelector('button[aria-label*="Next"], button[aria-label*="next"], .artdeco-pagination__button--next:not([disabled]), button[data-testid="pagination-controls-next-button-visible"]');
  if (nextButton && !nextButton.disabled) {
    nextButton.click();
    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }
  return false;
}

// ============================================================================
// SCANNING LOGIC
// ============================================================================

let lastCardCount = 0;
let scanInProgress = false;
let currentJobScanInProgress = false;
let manualScanInProgress = false;

// Unified function to scan the currently open job
// This handles both panel display and badge updates
async function scanCurrentJob(forceRescan = false) {
  // Prevent concurrent scans of the same job
  if (currentJobScanInProgress) return null;

  // Get current job ID (URL or active card)
  const urlJobId = extractJobIdFromUrl();
  const activeCard = document.querySelector(
    '[data-job-id].jobs-search-results-list__list-item--active, ' +
    '[data-job-id][aria-current="page"]'
  );
  const activeJobId = activeCard?.getAttribute('data-job-id');
  const jobId = urlJobId || activeJobId;

  if (!jobId) return null;

  // Check cache unless forcing rescan
  if (!forceRescan) {
    const cached = await getCachedJobResult(jobId);
    if (cached && isCacheValid(cached)) {
      // Use cached result but still update UI
      const visaMatches = cached.visaMatches || [];
      const customMatches = cached.customMatches || [];
      const hasVisaMatch = visaMatches.length > 0;
      const customMatchCount = customMatches.reduce((sum, m) => sum + m.count, 0);

      // Update badge
      const card = findJobCards().find(c => extractJobId(c) === jobId);
      if (card) {
        ensureBadgeExists(card, jobId);
        updateBadgeForCard(card, hasVisaMatch, customMatchCount);
      }

      // Send cached results to panel
      const jdNode = findJobDescriptionNode();
      let highlightedVisaMatches = visaMatches;
      let highlightedCustomMatches = customMatches;

      if (jdNode) {
        // Always unhighlight first to clear any previous highlights
        unhighlight(jdNode);

        // Remove any existing banner before creating new one
        const existingBanner = jdNode.querySelector('.jl-results-banner');
        if (existingBanner) {
          existingBanner.remove();
        }

        const highlightedResults = highlightKeywords(jdNode);

        // Map highlighted results back to visa/custom matches with anchors
        const visaKws = currentVisaKeywords || DEFAULT_VISA_KEYWORDS;
        const visaKeywordSet = new Set(visaKws.map(k => k.toLowerCase()));
        highlightedVisaMatches = [];
        highlightedCustomMatches = [];

        highlightedResults.forEach(result => {
          const keyLower = result.key.toLowerCase();
          if (visaKeywordSet.has(keyLower)) {
            const existing = highlightedVisaMatches.find(m => m.key === keyLower);
            if (existing) {
              existing.anchors.push(...result.anchors);
            } else {
              highlightedVisaMatches.push({ key: result.key, count: result.count, anchors: result.anchors });
            }
          } else {
            const existing = highlightedCustomMatches.find(m => m.key === keyLower);
            if (existing) {
              existing.anchors.push(...result.anchors);
            } else {
              highlightedCustomMatches.push({ key: result.key, count: result.count, anchors: result.anchors });
            }
          }
        });

        // Insert results banner at the start of job description
        insertResultsBanner(jdNode, highlightedVisaMatches, highlightedCustomMatches);
      }

      chrome.runtime.sendMessage({
        type: 'CONTENT_RESULTS',
        data: {
          hasJD: !!jdNode && ((jdNode.innerText || jdNode.textContent || '').trim().length > 0),
          visaMatches: highlightedVisaMatches.map(m => ({ key: m.key, count: m.count, anchors: m.anchors || [] })),
          customMatches: highlightedCustomMatches.map(m => ({ key: m.key, count: m.count, anchors: m.anchors || [] })),
          jobTitle: cached.jobTitle || null,
          companyName: cached.companyName || null,
          jobId: jobId
        }
      });

      return { jobId, visaMatches, customMatches, fromCache: true };
    }
  }

  currentJobScanInProgress = true;

  // Show loading badge
  const card = findJobCards().find(c => extractJobId(c) === jobId);
  if (card) {
    ensureBadgeExists(card, jobId);
    const badges = card.querySelectorAll('.jl-badge');
    badges.forEach(badge => {
      badge.classList.remove('jl-badge--pending', 'jl-badge--none', 'jl-badge--error', 'jl-badge--confirmed');
      badge.classList.add('jl-badge--loading');
      badge.textContent = 'Scanning...';
      badge.title = 'Scanning job description...';
    });
  }

  try {
    // Wait for job description to load
    await new Promise(resolve => setTimeout(resolve, 500));

    const description = extractJobDescriptionFromDOM(jobId);
    if (!description || description.trim().length < MIN_DESCRIPTION_LENGTH) {
      currentJobScanInProgress = false;
      if (card) {
        const badges = card.querySelectorAll('.jl-badge');
        badges.forEach(badge => {
          if (badge.classList.contains('jl-badge--loading')) {
            badge.classList.remove('jl-badge--loading');
            badge.classList.add('jl-badge--pending');
            badge.textContent = 'Check';
            badge.title = 'Open job to scan full description';
          }
        });
      }
      return null;
    }

    // Extract job title and company name
    const jobTitle = extractJobTitle();
    const companyName = extractCompanyName();

    // Scan the description with both keyword lists in single pass
    const visaKws = currentVisaKeywords || DEFAULT_VISA_KEYWORDS;
    const customKws = currentCustomKeywords || [];
    const allKeywords = [...visaKws, ...customKws];

    // Single pass scan
    const allMatches = scanTextForKeywords(description, allKeywords);

    // Categorize matches into visa and custom
    const visaKeywordSet = new Set(visaKws.map(k => k.toLowerCase()));
    const visaMatches = [];
    const customMatches = [];

    allMatches.forEach(match => {
      const keyLower = match.key.toLowerCase();
      if (visaKeywordSet.has(keyLower)) {
        visaMatches.push(match);
      } else {
        customMatches.push(match);
      }
    });

    // Save to storage first (with fallback if storage quota exceeded)
    try {
      await saveJobScanResult(jobId, description, visaMatches, customMatches, jobTitle, companyName);
      jobDescriptionCache.set(jobId, description);
    } catch (storageError) {
      console.warn('Failed to save job scan result to storage:', storageError);
      // Continue without caching - still update the UI
      jobDescriptionCache.set(jobId, description);
    }

    // Find the correct card for this jobId and update badge
    const correctCard = findJobCards().find(c => extractJobId(c) === jobId);
    if (correctCard) {
      await updateBadgeFromStorage(correctCard, jobId);
    }

    // Highlight keywords in job description and get anchors
    const jdNode = findJobDescriptionNode();
    let highlightedVisaMatches = visaMatches;
    let highlightedCustomMatches = customMatches;

    if (jdNode) {
      // Always unhighlight first to clear any previous highlights
      unhighlight(jdNode);

      // Remove any existing banner before creating new one
      const existingBanner = jdNode.querySelector('.jl-results-banner');
      if (existingBanner) {
        existingBanner.remove();
      }

      const highlightedResults = highlightKeywords(jdNode);

      // Map highlighted results back to visa/custom matches with anchors
      const visaKeywordSet = new Set(visaKws.map(k => k.toLowerCase()));
      highlightedVisaMatches = [];
      highlightedCustomMatches = [];

      highlightedResults.forEach(result => {
        const keyLower = result.key.toLowerCase();
        if (visaKeywordSet.has(keyLower)) {
          const existing = highlightedVisaMatches.find(m => m.key === keyLower);
          if (existing) {
            existing.anchors.push(...result.anchors);
          } else {
            highlightedVisaMatches.push({ key: result.key, count: result.count, anchors: result.anchors });
          }
        } else {
          const existing = highlightedCustomMatches.find(m => m.key === keyLower);
          if (existing) {
            existing.anchors.push(...result.anchors);
          } else {
            highlightedCustomMatches.push({ key: result.key, count: result.count, anchors: result.anchors });
          }
        }
      });

      // Insert results banner at the start of job description
      insertResultsBanner(jdNode, highlightedVisaMatches, highlightedCustomMatches);
    }

    // Send results to panel
    chrome.runtime.sendMessage({
      type: 'CONTENT_RESULTS',
      data: {
        hasJD: !!jdNode && ((jdNode.innerText || jdNode.textContent || '').trim().length > 0),
        visaMatches: highlightedVisaMatches.map(m => ({ key: m.key, count: m.count, anchors: m.anchors || [] })),
        customMatches: highlightedCustomMatches.map(m => ({ key: m.key, count: m.count, anchors: m.anchors || [] })),
        jobTitle: jobTitle || null,
        companyName: companyName || null,
        jobId: jobId
      }
    });

    return { jobId, visaMatches, customMatches, fromCache: false };
  } finally {
    currentJobScanInProgress = false;
  }
}

// Ensure badge exists on a card (creates both visa and custom badges)
function ensureBadgeExists(card, jobId) {
  let badgeContainer = card.querySelector('.jl-badge-container');
  if (!badgeContainer) {
    badgeContainer = document.createElement('div');
    badgeContainer.className = 'jl-badge-container';
    const cardElement = card.querySelector('.job-card-container') ||
      card.querySelector('[data-job-id]') ||
      card;
    if (cardElement) {
      cardElement.style.position = 'relative';
      cardElement.appendChild(badgeContainer);
    }
  }

  // Ensure both badges exist
  let visaBadge = badgeContainer.querySelector('.jl-badge-visa');
  if (!visaBadge) {
    visaBadge = document.createElement('span');
    visaBadge.className = 'jl-badge jl-badge-visa';
    badgeContainer.appendChild(visaBadge);
  }

  let customBadge = badgeContainer.querySelector('.jl-badge-custom');
  if (!customBadge) {
    customBadge = document.createElement('span');
    customBadge.className = 'jl-badge jl-badge-custom';
    badgeContainer.appendChild(customBadge);
  }

  return { visaBadge, customBadge };
}

function scanAll() {
  // Prevent redundant scans
  if (scanInProgress) return;
  scanInProgress = true;

  const listNodes = findJobCards();

  // Track card count for performance
  lastCardCount = listNodes.length;

  scanCurrentJob().then(() => {
    // Update badges for all cards - always read from storage
    listNodes.forEach(card => {
      const jobId = extractJobId(card);
      if (jobId) {
        updateBadgeFromStorage(card, jobId);
      }
    });

    // Retry badge updates for lazy-loaded cards
    setTimeout(() => {
      const retryCards = findJobCards();
      retryCards.forEach(card => {
        const jobId = extractJobId(card);
        if (jobId) {
          updateBadgeFromStorage(card, jobId);
        }
      });
    }, 1000);

    setTimeout(() => {
      const retryCards = findJobCards();
      retryCards.forEach(card => {
        const jobId = extractJobId(card);
        if (jobId) {
          updateBadgeFromStorage(card, jobId);
        }
      });
    }, 3000);

    scanInProgress = false;
  }).catch(() => {
    scanInProgress = false;
  });
}

// Queue jobs for automatic scanning (only used by full list scan)
function queueAutoScan(cards) {
  if (!cards || !cards.length) return;

  cards.forEach(card => {
    const jobId = extractJobId(card);
    if (!jobId) return;

    // Skip if already scanned or in queue
    if (jobDescriptionCache.has(jobId) ||
      scanningJobs.has(jobId) ||
      autoScanQueue.includes(jobId)) return;

    // Skip if already has confirmed badge
    const badge = card.querySelector('.jl-badge');
    if (badge && badge.classList.contains('jl-badge--confirmed')) return;

    autoScanQueue.push(jobId);
  });

  processAutoScanQueue();
}

// Process auto-scan queue
async function processAutoScanQueue() {
  if (isAutoScanning || autoScanQueue.length === 0) return;
  if (scanningJobs.size >= MAX_CONCURRENT_AUTO_SCANS) {
    setTimeout(() => processAutoScanQueue(), 2000);
    return;
  }

  isAutoScanning = true;
  const jobId = autoScanQueue.shift();

  if (jobId && !scanningJobs.has(jobId)) {
    await autoScanJob(jobId);
  }

  isAutoScanning = false;

  // Continue processing queue
  if (autoScanQueue.length > 0) {
    setTimeout(() => processAutoScanQueue(), 1000);
  }
}

// Automatically scan a job by opening it
async function autoScanJob(jobId) {
  scanningJobs.add(jobId);

  try {
    // Find the job card element
    const card = findJobCards().find(c => extractJobId(c) === jobId);
    if (!card) {
      scanningJobs.delete(jobId);
      return;
    }

    // Find and click the job link to open it
    let clickTarget = card.querySelector(`a[href*="/jobs/view/${jobId}"]`);

    // AI job search cards are themselves clickable (div[role="button"])
    if (!clickTarget && card.getAttribute('role') === 'button') {
      clickTarget = card;
    }

    if (!clickTarget) {
      scanningJobs.delete(jobId);
      return;
    }

    // Set flag to prevent click handler from triggering duplicate scan
    urlScanInProgress = true;

    // Click to open the job
    clickTarget.click();

    // Wait for the card to become active (LinkedIn two-pane view)
    // Check both URL change (full page) and active class (two-pane)
    let description = null;
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if card's inner div is now active (two-pane view)
      // The active class is on the div with data-job-id, not the li
      const innerCard = card.querySelector(`[data-job-id="${jobId}"]`);
      const isActive = innerCard && (
        innerCard.classList.contains('jobs-search-results-list__list-item--active') ||
        innerCard.hasAttribute('aria-current')
      );

      // Check if URL changed (full page view or AI search view)
      const urlJobId = extractJobIdFromUrl();
      const urlMatches = urlJobId === jobId;

      if (isActive || urlMatches) {
        description = extractJobDescriptionFromDOM(jobId);
        if (description) {
          break; // Successfully extracted
        }
      }
    }

    if (description) {
      jobDescriptionCache.set(jobId, description);

      // Extract job title and company name
      const jobTitle = extractJobTitle();
      const companyName = extractCompanyName();

      // Scan with both keyword lists
      const visaKws = currentVisaKeywords || DEFAULT_VISA_KEYWORDS;
      const customKws = currentCustomKeywords || [];
      const allKeywords = [...visaKws, ...customKws];
      const allMatches = scanTextForKeywords(description, allKeywords);

      // Categorize matches
      const visaKeywordSet = new Set(visaKws.map(k => k.toLowerCase()));
      const visaMatches = [];
      const customMatches = [];

      allMatches.forEach(match => {
        const keyLower = match.key.toLowerCase();
        if (visaKeywordSet.has(keyLower)) {
          visaMatches.push(match);
        } else {
          customMatches.push(match);
        }
      });

      // Save to storage first
      await saveJobScanResult(jobId, description, visaMatches, customMatches, jobTitle, companyName);

      // Find the correct card for this jobId and update badge
      const correctCard = findJobCards().find(c => extractJobId(c) === jobId);
      if (correctCard) {
        await updateBadgeFromStorage(correctCard, jobId);
      }
    } else {
      // Couldn't get description - remove loading badges (don't show incorrect data)
      const badgeContainer = card.querySelector('.jl-badge-container');
      if (badgeContainer) {
        badgeContainer.remove();
      }
    }

    scanningJobs.delete(jobId);
    // Reset flag after auto-scan completes
    urlScanInProgress = false;
  } catch (error) {
    console.warn('Auto-scan error:', error);
    scanningJobs.delete(jobId);
    // Reset flag on error too
    urlScanInProgress = false;
  }
}

// ============================================================================
// JOB DESCRIPTION EXTRACTION
// ============================================================================

function findJobDescriptionNode() {
  // Primary selectors – older LinkedIn layouts
  const selectors = [
    '[data-test-id="job-details"]',
    '#job-details',
    '.jobs-description__container',
    '.jobs-search__job-details--container',
    'section.jobs-description'
  ];
  for (const sel of selectors) {
    const node = document.querySelector(sel);
    if (node) return node;
  }

  // Fallback for newer LinkedIn full-page layout:
  // job description text lives in a span with data-testid="expandable-text-box"
  const expandableText = document.querySelector('span[data-testid="expandable-text-box"]');
  if (expandableText) {
    // Use the span itself as the root node; all text is inside it
    return expandableText;
  }

  // Last-resort fallback: look for a large text block in the main job container
  const genericContainers = document.querySelectorAll(
    'div[data-view-name="job-details"], main div'
  );
  for (const container of genericContainers) {
    if (!container) continue;
    const text = (container.innerText || container.textContent || '').trim();
    if (text && text.length > 300 && /about the job/i.test(text)) {
      return container;
    }
  }

  return null;
}

// Insert results banner at the start of job description
function insertResultsBanner(jdNode, visaMatches, customMatches) {
  // Determine where the banner should live.
  // NEW LinkedIn layout:
  //  - The description text lives inside a span[data-testid="expandable-text-box"].
  //  - That span is inside a <p> which sits inside a larger container <div>.
  //  - Inserting a block <div> banner directly inside <p> causes bad stretching.
  //
  // So, when jdNode is that span, we:
  //  - Use the outer container (<div>) as the "root"
  //  - Insert the banner BEFORE the <p> that contains the span.
  let bannerRoot = jdNode;
  let insertBeforeNode = null;

  if (jdNode.tagName === 'SPAN' && jdNode.parentElement) {
    const paragraph = jdNode.parentElement;
    const outer = paragraph.parentElement || paragraph;
    bannerRoot = outer;
    insertBeforeNode = paragraph;
  }

  // Remove existing banner if present
  const existingBanner = bannerRoot.querySelector('.jl-results-banner');
  if (existingBanner) {
    existingBanner.remove();
  }

  const visaTotal = visaMatches.reduce((sum, m) => sum + m.count, 0);
  const customTotal = customMatches.reduce((sum, m) => sum + m.count, 0);

  // Only show banner if there are matches
  if (visaTotal === 0 && customTotal === 0) return;

  const banner = document.createElement('div');
  banner.className = 'jl-results-banner';

  // Build custom keywords list with anchors
  const customKeywordsList = [];
  customMatches.forEach(m => {
    for (let i = 0; i < m.count; i++) {
      const anchorId = m.anchors && m.anchors[i] ? m.anchors[i] : null;
      customKeywordsList.push({ keyword: m.key, anchorId });
    }
  });

  // Build visa keywords list with anchors
  const visaKeywordsList = [];
  visaMatches.forEach(m => {
    for (let i = 0; i < m.count; i++) {
      const anchorId = m.anchors && m.anchors[i] ? m.anchors[i] : null;
      visaKeywordsList.push({ keyword: m.key, anchorId });
    }
  });

  banner.innerHTML = `
    <div class="jl-banner-content">
      <div class="jl-banner-title-row">🔍 Keywords Found 🔍</div>
      ${customTotal > 0 ? `
        <div class="jl-banner-row">
          <span class="jl-banner-label">Matches:</span>
          <span class="jl-banner-keywords">
            ${customKeywordsList.map((item, idx) => {
    return `<span class="jl-banner-keyword" data-anchor-id="${item.anchorId || ''}" data-keyword-index="${idx}">${escapeHtml(item.keyword)}</span>`;
  }).join(' ')}
          </span>
        </div>
      ` : ''}
      ${visaTotal > 0 ? `
        <div class="jl-banner-row">
          <span class="jl-banner-label">Visa:</span>
          <span class="jl-banner-keywords">
            ${visaKeywordsList.map((item, idx) => {
    return `<span class="jl-banner-keyword" data-anchor-id="${item.anchorId || ''}" data-keyword-index="${idx}">${escapeHtml(item.keyword)}</span>`;
  }).join(' ')}
          </span>
        </div>
      ` : ''}
    </div>
  `;

  // Insert at the beginning of the job description container.
  // For the new layout we insert before the <p> that holds the span,
  // otherwise we insert as the first child of the root node.
  if (insertBeforeNode && insertBeforeNode.parentNode === bannerRoot) {
    bannerRoot.insertBefore(banner, insertBeforeNode);
  } else if (bannerRoot.firstChild) {
    bannerRoot.insertBefore(banner, bannerRoot.firstChild);
  } else {
    bannerRoot.appendChild(banner);
  }

  // Attach click handlers after insertion (to avoid CSP issues)
  banner.querySelectorAll('.jl-banner-keyword[data-anchor-id]').forEach(keywordEl => {
    const anchorId = keywordEl.getAttribute('data-anchor-id');
    if (anchorId) {
      keywordEl.style.cursor = 'pointer';
      keywordEl.addEventListener('click', () => {
        const targetEl = document.getElementById(anchorId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  });
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} s - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}

function extractJobDescriptionText() {
  const node = findJobDescriptionNode();
  if (!node) return '';

  // Clone the node to avoid modifying the original
  const clone = node.cloneNode(true);

  // Remove banner and highlighted marks before extracting text
  const banner = clone.querySelector('.jl-results-banner');
  if (banner) banner.remove();
  clone.querySelectorAll('mark.jl-mark').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.replaceWith(text);
  });

  return (clone.innerText || clone.textContent || '').replace(/\n\s*\n/g, '\n\n').trim();
}

function extractJobDescriptionFromDOM(jobId) {
  // Check if URL matches (for both full-page and two-pane view)
  const urlJobId = extractJobIdFromUrl();

  // Check if this job card is active (for two-pane view)
  const activeCard = document.querySelector(
    `[data-job-id="${jobId}"].jobs-search-results-list__list-item--active, ` +
    `[data-job-id="${jobId}"][aria-current="page"]`
  );
  const isActiveInPanel = !!activeCard;

  // Must match URL OR be active in side panel
  if (urlJobId !== jobId && !isActiveInPanel) {
    return null;
  }

  // Extract description from the side panel or main content
  const jobDetailNode = findJobDescriptionNode();
  if (jobDetailNode) {
    // Clone the node to avoid modifying the original
    const clone = jobDetailNode.cloneNode(true);

    // Remove banner and highlighted marks before extracting text
    const banner = clone.querySelector('.jl-results-banner');
    if (banner) banner.remove();
    clone.querySelectorAll('mark.jl-mark').forEach(mark => {
      const text = document.createTextNode(mark.textContent);
      mark.replaceWith(text);
    });

    const text = clone.innerText || clone.textContent || '';
    const trimmedText = text.trim();
    // Check for sufficient content and that it's not just loading placeholders
    if (trimmedText.length >= MIN_DESCRIPTION_LENGTH && !trimmedText.match(/^(loading|please wait)/i)) {
      return trimmedText;
    }
  }

  return null;
}

// ============================================================================
// JOB CARD FINDING & ID EXTRACTION
// ============================================================================
function findJobCards() {
  const jobIdElements = document.querySelectorAll('[data-occludable-job-id]');
  if (jobIdElements.length > 0) {
    return Array.from(jobIdElements);
  }

  const scaffoldItems = document.querySelectorAll('.scaffold-layout__list-item');
  if (scaffoldItems.length > 0) {
    const jobCards = Array.from(scaffoldItems).filter(item =>
      item.querySelector('a[href*="/jobs/view/"]') ||
      item.getAttribute('data-job-id') ||
      item.querySelector('[data-job-id]')
    );
    if (jobCards.length > 0) {
      return jobCards;
    }
  }

  // AI job search page (/jobs/search-results/) — cards are div[role="button"] with componentkey
  const aiJobCards = document.querySelectorAll('div[role="button"][componentkey^="job-card-component-ref-"]');
  if (aiJobCards.length > 0) {
    return Array.from(aiJobCards);
  }

  const fallbackSelectors = [
    '.jobs-search-results__list-item',
    '.scaffold-layout__list-container [data-view-name="job-card"]',
    'ul.jobs-search__results-list li',
    '.job-card-container',
    '.jobs-search__job-card'
  ];

  for (const sel of fallbackSelectors) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length > 0) {
      return nodes;
    }
  }

  return [];
}

function extractJobId(cardElement) {
  if (!cardElement) return null;

  let jobId = cardElement.getAttribute('data-occludable-job-id');
  if (jobId) return jobId;

  jobId = cardElement.getAttribute('data-job-id');
  if (jobId) return jobId;

  // AI job search page — extract from componentkey attribute
  const componentKey = cardElement.getAttribute('componentkey');
  if (componentKey) {
    const ckMatch = componentKey.match(/^job-card-component-ref-(\d+)$/);
    if (ckMatch) return ckMatch[1];
  }

  const jobIdElement = cardElement.querySelector('[data-job-id]');
  if (jobIdElement) {
    jobId = jobIdElement.getAttribute('data-job-id');
    if (jobId) return jobId;
  }

  const link = cardElement.querySelector('a[href*="/jobs/view/"]');
  if (link) {
    const match = link.href.match(/\/jobs\/view\/(\d+)/);
    if (match) return match[1];
  }

  const urn = cardElement.getAttribute('data-entity-urn') ||
    cardElement.querySelector('[data-entity-urn]')?.getAttribute('data-entity-urn');
  if (urn) {
    const match = urn.match(/urn:li:jobPosting:(\d+)/);
    if (match) return match[1];
  }

  return null;
}

// ============================================================================
// KEYWORD SCANNING
// ============================================================================

function scanTextForKeywords(text, keywords) {
  if (!text || !keywords || !keywords.length) return [];

  // Remove duplicates from keywords list to prevent double scanning
  const uniqueKeywords = [...new Set(keywords.map(k => k.toLowerCase()))].map(k => {
    // Find original keyword (preserve case from first occurrence)
    return keywords.find(orig => orig.toLowerCase() === k) || k;
  });

  const matches = [];
  const foundKeys = new Map();

  // Sort keywords by length (longest first) to match longer phrases first
  const sortedKeywords = uniqueKeywords.sort((a, b) => b.length - a.length);

  // Track which character positions have been matched
  const matchedPositions = new Set();

  for (const keyword of sortedKeywords) {
    const keywordLower = keyword.toLowerCase();
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedKeyword, 'gi');

    let match;
    regex.lastIndex = 0;

    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Check if this position range overlaps with any already matched position
      let overlaps = false;
      for (let pos = start; pos < end; pos++) {
        if (matchedPositions.has(pos)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        // Mark these positions as matched
        for (let pos = start; pos < end; pos++) {
          matchedPositions.add(pos);
        }

        // Update match count
        if (!foundKeys.has(keywordLower)) {
          foundKeys.set(keywordLower, { key: keywordLower, count: 0 });
          matches.push(foundKeys.get(keywordLower));
        }
        foundKeys.get(keywordLower).count++;
      }

      // Prevent infinite loop
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }
  }

  return matches;
}

/**
 * Normalize and deduplicate keywords list
 * @param {Array<string>} list - Array of keywords
 * @returns {Array<string>} Normalized and deduplicated keywords
 */
function normalizeKeywords(list) {
  if (!Array.isArray(list)) return [];
  const uniq = new Set();
  list.forEach(k => {
    if (k == null) return;
    const s = String(k).trim().toLowerCase();
    if (s) uniq.add(s);
  });
  return Array.from(uniq);
}

function buildRegexFromKeywords(keywords) {
  const parts = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`(${parts.join('|')})`, 'gi');
}

// ============================================================================
// KEYWORD HIGHLIGHTING
// ============================================================================

function highlightKeywords(root) {
  // Always unhighlight first to prevent duplicates
  unhighlight(root);

  const results = [];
  const visaKws = currentVisaKeywords || DEFAULT_VISA_KEYWORDS;
  const customKws = currentCustomKeywords || [];
  const allKeywords = [...visaKws, ...customKws];
  const regex = buildRegexFromKeywords(allKeywords);
  let counter = 0;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const toWrap = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.nodeValue || !node.nodeValue.trim()) continue;
    // Skip if node is inside an existing mark (shouldn't happen after unhighlight, but safety check)
    if (node.parentElement && node.parentElement.classList.contains('jl-mark')) continue;
    if (!regex.test(node.nodeValue)) { regex.lastIndex = 0; continue; }
    regex.lastIndex = 0;
    const parts = node.nodeValue.split(regex);
    if (parts.length <= 1) continue;
    toWrap.push({ node, parts });
  }

  toWrap.forEach(({ node, parts }) => {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < parts.length; i++) {
      const text = parts[i];
      if (text === undefined || text === null || text === '') continue;
      if ((i % 2) === 1) {
        const key = text.toLowerCase();
        const anchorId = `jl-${++counter}`;
        const mark = document.createElement('mark');
        mark.className = 'jl-mark';
        mark.dataset.key = key;
        mark.id = anchorId;
        mark.textContent = text;
        frag.appendChild(mark);
        addResult(results, key, anchorId);
      } else {
        frag.appendChild(document.createTextNode(text));
      }
    }
    node.parentNode.replaceChild(frag, node);
  });

  return results;
}

function addResult(results, key, anchorId) {
  const entry = results.find(r => r.key === key);
  if (entry) {
    entry.count += 1;
    entry.anchors.push(anchorId);
  } else {
    results.push({ key, count: 1, anchors: [anchorId] });
  }
}

function unhighlight(root) {
  root.querySelectorAll('mark.jl-mark').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.replaceWith(text);
  });
}

// ============================================================================
// BADGE SYSTEM
// ============================================================================

function badgeJobCards(cards) {
  if (!cards || !cards.length) return;

  cards.forEach(card => {
    const existingBadge = card.querySelector('.jl-badge-container');
    if (existingBadge && card.hasAttribute('data-jl-processed')) {
      return;
    }

    card.setAttribute('data-jl-processed', 'true');

    const jobId = extractJobId(card);
    if (jobId) {
      updateBadgeFromStorage(card, jobId);
    }
  });
}

function updateBadgeForCard(card, hasVisaMatch, customMatchCount) {
  const visaBadge = card.querySelector('.jl-badge-visa');
  const customBadge = card.querySelector('.jl-badge-custom');

  if (visaBadge) {
    visaBadge.classList.remove('jl-badge--pending', 'jl-badge--loading', 'jl-badge--error', 'jl-badge--none', 'jl-badge--confirmed');
    visaBadge.style.pointerEvents = 'none';

    if (hasVisaMatch) {
      visaBadge.classList.add('jl-badge--confirmed');
      visaBadge.title = 'Visa sponsorship confirmed!';
      visaBadge.textContent = '✓ Visa';
    } else {
      visaBadge.classList.add('jl-badge--none');
      visaBadge.title = 'No visa sponsorship keywords found';
      visaBadge.textContent = '✗ Visa';
    }
  }

  if (customBadge) {
    customBadge.classList.remove('jl-badge--pending', 'jl-badge--loading', 'jl-badge--error', 'jl-badge--none', 'jl-badge--confirmed');
    customBadge.style.pointerEvents = 'none';

    if (customMatchCount > 0) {
      customBadge.classList.add('jl-badge--confirmed');
      customBadge.title = `Found ${customMatchCount} custom keyword match(es)`;
      customBadge.textContent = `${customMatchCount}x Match`;
    } else {
      customBadge.classList.add('jl-badge--none');
      customBadge.title = 'No custom keywords found';
      customBadge.textContent = '✗ Match';
    }
  }
}

async function checkAndUpdateBadgesForOpenJob() {
  // Prevent multiple concurrent manual scans
  if (manualScanInProgress) return;
  manualScanInProgress = true;

  try {
    // Use unified scan function - it handles everything (badge + panel)
    const result = await scanCurrentJob(true);

    if (!result) {
      // Job description not ready yet, retry
      setTimeout(() => {
        manualScanInProgress = false;
        checkAndUpdateBadgesForOpenJob();
      }, 1000);
    } else {
      manualScanInProgress = false;
    }
  } catch (error) {
    manualScanInProgress = false;
    throw error;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

