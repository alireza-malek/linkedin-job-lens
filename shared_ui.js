/**
 * Shared UI Components for LinkedIn Job Lens
 * Used by both the Side Panel (panel.js) and In-Page Content Script (content.js)
 */

(function (global) {
  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} s - String to escape
   * @returns {string} Escaped string
   */
  function escapeHtml(s) {
    if (typeof s !== 'string') return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      '\'': '&#39;'
    }[c]));
  }

  /**
   * Formats AI answer text with bold (**text**), italic (*text*), code (`text`),
   * underline, strikethrough, and bullet lists while escaping HTML.
   * @param {string} rawText
   * @returns {string} Formatted HTML string
   */
  function formatAiAnswerText(rawText) {
    if (!rawText) return '';

    let safe = escapeHtml(String(rawText));

    // Underline: <u>text</u>
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

    // Italic: *text*
    safe = safe.replace(/(?<=^|[^*])\*(?!\*)([^*\n]+?)(?<!\*)\*(?=[^*]|$)/g, '<em>$1</em>');
    safe = safe.replace(/(?<=^|[^a-zA-Z0-9_])_(?!_)([^_\n]+?)(?<!_)_(?=[^a-zA-Z0-9_]|$)/g, '<em>$1</em>');

    // Inline code: `code`
    safe = safe.replace(/`([^`\n]+?)`/g, '<code class="ai-inline-code">$1</code>');

    return safe;
  }

  /**
   * Creates an expandable criteria or query-result item with a copy button
   */
  function createCriteriaItemElement({ name, text, copyTitle = 'Copy result', onCopySuccess = null, allowCopy = true }) {
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

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ai-criteria-toggle-btn';
    toggleBtn.title = 'Expand/Collapse';
    toggleBtn.textContent = '▼';
    actions.appendChild(toggleBtn);

    header.appendChild(actions);
    item.appendChild(header);

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
        if (typeof onCopySuccess === 'function') {
          onCopySuccess(name);
        }
      });
      actions.appendChild(copyBtn);
    }

    return item;
  }

  /**
   * Creates an AI slot card element (used by both panel and in-page stream)
   */
  function createAISlotCardElement(slot, { onDelete = null, onCopySuccess = null } = {}) {
    const card = document.createElement('div');
    card.className = 'ai-slot-card';

    // Header
    const header = document.createElement('div');
    header.className = 'ai-slot-header';

    const badgeGroup = document.createElement('div');
    badgeGroup.className = 'ai-slot-badge-group';

    const typeBadge = document.createElement('span');
    typeBadge.className = `ai-slot-type-badge ${slot.type === 'custom_ask' ? 'ask' : 'template'}`;
    typeBadge.textContent = slot.type === 'custom_ask' ? '💬 Ask' : '✨ Insight';
    badgeGroup.appendChild(typeBadge);

    const titleSpan = document.createElement('span');
    titleSpan.className = 'ai-slot-title';
    titleSpan.textContent = slot.type === 'custom_ask' ? (slot.query || 'Custom Query') : (slot.templateName || 'Insight');
    titleSpan.title = titleSpan.textContent;
    badgeGroup.appendChild(titleSpan);

    const meta = document.createElement('div');
    meta.className = 'ai-slot-meta';

    // Token Usage & Time Info Icon with Instant Tooltip
    const tokens = slot.tokens;
    const requestId = slot.requestId || slot.tokens?.requestId;
    const dateObj = new Date(slot.timestamp || Date.now());
    const fullTimeStr = dateObj.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const infoIcon = document.createElement('span');
    infoIcon.className = 'ai-slot-token-info';

    let tooltipRows = `<div class="ai-slot-tooltip-row"><span class="ai-slot-tooltip-label">Time:</span><span>${escapeHtml(fullTimeStr)}</span></div>`;

    if (tokens && (tokens.input != null || tokens.output != null)) {
      const inTok = tokens.input ?? 0;
      const outTok = tokens.output ?? 0;
      const totalTok = tokens.total ?? (inTok + outTok);
      const reasoningTok = typeof tokens.reasoning === 'number' ? tokens.reasoning : parseInt(tokens.reasoning, 10);
      const reasoningStr = (!isNaN(reasoningTok) && reasoningTok > 0) ? ` · ${reasoningTok.toLocaleString()} reasoning` : '';
      tooltipRows += `<div class="ai-slot-tooltip-row"><span class="ai-slot-tooltip-label">Tokens:</span><span>${inTok.toLocaleString()} in · ${outTok.toLocaleString()} out${reasoningStr} (${totalTok.toLocaleString()} total)</span></div>`;
    }

    if (requestId) {
      tooltipRows += `<div class="ai-slot-tooltip-row"><span class="ai-slot-tooltip-label">Request ID:</span><span class="ai-slot-tooltip-id" title="${escapeHtml(requestId)}">${escapeHtml(requestId)}</span></div>`;
    }

    infoIcon.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="8" cy="8" r="6.8" stroke="currentColor" stroke-width="1.3"/>
        <path d="M8 7.2V11.5M8 4.6V5.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      <div class="ai-slot-tooltip">
        ${tooltipRows}
      </div>
    `;
    meta.appendChild(infoIcon);

    if (onDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'ai-slot-delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Remove this insight';
      deleteBtn.addEventListener('click', (e) => {
        if (e) {
          e.stopPropagation();
          e.preventDefault();
        }
        onDelete(slot);
      });
      meta.appendChild(deleteBtn);
    }

    header.appendChild(badgeGroup);
    header.appendChild(meta);
    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'ai-slot-body';

    if (slot.type === 'custom_ask') {
      const askItem = createCriteriaItemElement({
        name: slot.query || 'Custom Question',
        text: slot.answer || '',
        copyTitle: 'Copy answer',
        onCopySuccess: onCopySuccess,
        allowCopy: true
      });
      body.appendChild(askItem);
    } else {
      const criteriaList = document.createElement('div');
      criteriaList.className = 'ai-criteria-list';

      (slot.criterias || []).forEach((c) => {
        const item = createCriteriaItemElement({
          name: c.name,
          text: c.result || '',
          copyTitle: `Copy ${c.name}`,
          onCopySuccess: onCopySuccess,
          allowCopy: true
        });
        criteriaList.appendChild(item);
      });

      body.appendChild(criteriaList);
    }

    card.appendChild(body);
    return card;
  }

  /**
   * Creates the Keywords Found banner card element (used by both panel and in-page view)
   */
  function createKeywordsCardElement({
    visaTotal = 0,
    customTotal = 0,
    visaKeywordsList = [],
    customKeywordsList = [],
    onScrollToMatch = null
  } = {}) {
    const banner = document.createElement('div');
    banner.className = 'jl-results-banner';

    const content = document.createElement('div');
    content.className = 'jl-banner-content';

    const titleRow = document.createElement('div');
    titleRow.className = 'jl-banner-title-row';

    const titleText = document.createElement('span');
    titleText.className = 'jl-banner-title-text';
    titleText.innerHTML = `<span>🔍</span><span>Keywords Found</span>`;

    const badgesDiv = document.createElement('div');
    badgesDiv.className = 'jl-banner-badges';

    const visaBadge = document.createElement('span');
    visaBadge.className = `jl-banner-badge ${visaTotal > 0 ? 'badge--confirmed' : 'badge--none'}`;
    visaBadge.textContent = visaTotal > 0 ? '✓ Visa' : '✗ Visa';
    if (visaTotal > 0 && visaKeywordsList.length > 0 && visaKeywordsList[0].anchorId) {
      visaBadge.style.cursor = 'pointer';
      visaBadge.title = 'Click to scroll to first visa match';
      visaBadge.addEventListener('click', () => {
        if (onScrollToMatch) onScrollToMatch(visaKeywordsList[0].anchorId);
      });
    }

    const customBadge = document.createElement('span');
    customBadge.className = `jl-banner-badge ${customTotal > 0 ? 'badge--confirmed' : 'badge--none'}`;
    customBadge.textContent = customTotal > 0 ? `${customTotal}x Match` : '✗ Match';
    if (customTotal > 0 && customKeywordsList.length > 0 && customKeywordsList[0].anchorId) {
      customBadge.style.cursor = 'pointer';
      customBadge.title = 'Click to scroll to first custom match';
      customBadge.addEventListener('click', () => {
        if (onScrollToMatch) onScrollToMatch(customKeywordsList[0].anchorId);
      });
    }

    badgesDiv.appendChild(visaBadge);
    badgesDiv.appendChild(customBadge);
    titleRow.appendChild(titleText);
    titleRow.appendChild(badgesDiv);
    content.appendChild(titleRow);

    if (visaTotal === 0 && customTotal === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'jl-banner-empty-text';
      emptyMsg.textContent = 'No keyword matches found in job description.';
      content.appendChild(emptyMsg);
    } else {
      if (customTotal > 0) {
        const row = document.createElement('div');
        row.className = 'jl-banner-row';

        const label = document.createElement('span');
        label.className = 'jl-banner-label';
        label.textContent = 'Matches:';

        const keywords = document.createElement('span');
        keywords.className = 'jl-banner-keywords';

        customKeywordsList.forEach((item, idx) => {
          const keywordSpan = document.createElement('span');
          keywordSpan.className = 'jl-banner-keyword';
          keywordSpan.textContent = `${item.keyword}`;
          if (item.anchorId) {
            keywordSpan.style.cursor = 'pointer';
            keywordSpan.setAttribute('data-anchor-id', item.anchorId);
            keywordSpan.setAttribute('data-keyword-index', idx);
            keywordSpan.addEventListener('click', () => {
              if (onScrollToMatch) onScrollToMatch(item.anchorId);
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

        visaKeywordsList.forEach((item, idx) => {
          const keywordSpan = document.createElement('span');
          keywordSpan.className = 'jl-banner-keyword';
          keywordSpan.textContent = `${item.keyword}`;
          if (item.anchorId) {
            keywordSpan.style.cursor = 'pointer';
            keywordSpan.setAttribute('data-anchor-id', item.anchorId);
            keywordSpan.setAttribute('data-keyword-index', idx);
            keywordSpan.addEventListener('click', () => {
              if (onScrollToMatch) onScrollToMatch(item.anchorId);
            });
          }
          keywords.appendChild(keywordSpan);
        });

        row.appendChild(label);
        row.appendChild(keywords);
        content.appendChild(row);
      }
    }

    banner.appendChild(content);
    return banner;
  }

  // Export to global scope
  const JobLensUI = {
    escapeHtml,
    formatAiAnswerText,
    createCriteriaItemElement,
    createAISlotCardElement,
    createKeywordsCardElement
  };

  global.JobLensUI = JobLensUI;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JobLensUI;
  }
})(typeof window !== 'undefined' ? window : this);
