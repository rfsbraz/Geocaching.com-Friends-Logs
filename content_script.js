/* global DEFAULT_VALUES, getStoreUrl */

/**
 * Content script that injects the main script into the page context.
 * This is needed because the page's jQuery, userToken, and other globals
 * are not accessible from the content script context.
 */

function injectScript(file, node, showMyLogs, showFriendsLogs, limit) {
  const th = document.getElementsByTagName(node)[0];
  if (!th) {
    console.error('[Friends Logs] Could not find element:', node);
    return;
  }

  const s = document.createElement('script');
  s.setAttribute('type', 'text/javascript');
  s.setAttribute('src', file + '?t=' + Date.now());
  s.setAttribute('id', 'inject');
  s.setAttribute('showFriendsLogs', String(showFriendsLogs));
  s.setAttribute('showMyLogs', String(showMyLogs));
  s.setAttribute('limit', String(limit));
  th.appendChild(s);
}

function doInject() {
  // Only inject if not already injected
  if (document.getElementById('inject')) {
    return;
  }

  chrome.storage.local.get(DEFAULT_VALUES, function (items) {
    if (chrome.runtime.lastError) {
      console.warn('[Friends Logs] Storage read failed:', chrome.runtime.lastError.message);
      // Fall back to defaults so injection still happens
      items = DEFAULT_VALUES;
    }

    const showMyLogs = items.showMyLogs;
    const showFriendsLogs = items.showFriendsLogs;
    const limit = items.limit;

    // Only inject if at least one option is enabled and not already injected
    if ((showMyLogs || showFriendsLogs) && !document.getElementById('inject')) {
      console.log('[Friends Logs] Injecting script');
      injectScript(chrome.runtime.getURL('inject.js'), 'body', showMyLogs, showFriendsLogs, limit);
    }
  });
}

/**
 * The cache page load with logs on which the one-time rating prompt shows (#135).
 */
const RATING_PROMPT_USE = 5;

/**
 * How long a page load waits for the extension to finish rendering its logs.
 */
const RATING_PROMPT_WAIT_MS = 60 * 1000;

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z';

let ratingPromptLoad = null;

/**
 * Resolves with the Logbook header inject.js appends after our logs, or null if the
 * extension rendered nothing before the timeout.
 * @param {number} timeoutMs
 * @returns {Promise<Element|null>}
 */
function waitForLogbookHeader(timeoutMs) {
  const find = () => document.querySelector('.gcfl-table .gcfl-logbook-header');
  return new Promise(resolve => {
    const found = find();
    if (found) {
      resolve(found);
      return;
    }
    const finish = header => {
      observer.disconnect();
      clearTimeout(timer);
      resolve(header);
    };
    const observer = new MutationObserver(() => {
      const header = find();
      if (header) {
        finish(header);
      }
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

/**
 * Counts one use and says whether this is the use that shows the prompt. Stops counting
 * once the prompt is done or the count is past the threshold.
 * @returns {Promise<boolean>}
 */
function recordRatingPromptUse() {
  return new Promise(resolve => {
    chrome.storage.local.get({ ratingPromptUses: 0, ratingPromptDone: false }, items => {
      if (chrome.runtime.lastError || items.ratingPromptDone) {
        resolve(false);
        return;
      }
      if (items.ratingPromptUses > RATING_PROMPT_USE) {
        resolve(false);
        return;
      }
      const uses = items.ratingPromptUses + 1;
      chrome.storage.local.set({ ratingPromptUses: uses }, () =>
        resolve(uses === RATING_PROMPT_USE)
      );
    });
  });
}

/**
 * Renders the rating prompt right above the Logbook header. "Rate it" and "Not now" both
 * remove it and save ratingPromptDone so it never shows again.
 * @param {Element} logbookHeader
 */
function renderRatingPrompt(logbookHeader) {
  const tbody = document.createElement('tbody');
  tbody.className = 'gcfl-rating';
  const tr = document.createElement('tr');
  const td = document.createElement('td');

  const box = document.createElement('div');
  box.className = 'gcfl-rating-prompt';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Friends Logs');

  const svgNs = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(svgNs, 'svg');
  icon.setAttribute('class', 'gcfl-rating-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const star = document.createElementNS(svgNs, 'path');
  star.setAttribute('d', STAR_PATH);
  icon.appendChild(star);

  const text = document.createElement('p');
  text.className = 'gcfl-rating-text';
  text.textContent = chrome.i18n.getMessage('ratingPromptText');

  const actions = document.createElement('div');
  actions.className = 'gcfl-rating-actions';
  const rate = document.createElement('a');
  rate.className = 'gcfl-rating-rate';
  rate.href = getStoreUrl();
  rate.target = '_blank';
  rate.rel = 'noopener noreferrer';
  rate.textContent = chrome.i18n.getMessage('ratingPromptRate');
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'gcfl-rating-dismiss';
  dismiss.textContent = chrome.i18n.getMessage('ratingPromptDismiss');

  const done = () => {
    tbody.remove();
    chrome.storage.local.set({ ratingPromptDone: true });
  };
  rate.addEventListener('click', done);
  dismiss.addEventListener('click', done);

  actions.append(rate, dismiss);
  box.append(icon, text, actions);
  td.appendChild(box);
  tr.appendChild(td);

  // Same gap before the Logbook header as after a section's log rows (#141).
  const spacer = document.createElement('tr');
  spacer.className = 'gcfl-spacer';
  spacer.setAttribute('aria-hidden', 'true');
  spacer.appendChild(document.createElement('td'));

  tbody.append(tr, spacer);
  logbookHeader.parentNode.insertBefore(tbody, logbookHeader);
}

/**
 * A use is one cache page load where the extension showed at least one friend or own log.
 * Counts this page load once, and shows the prompt on the RATING_PROMPT_USE-th use only.
 * @param {number} timeoutMs - How long to wait for the extension to render its logs
 * @returns {Promise<boolean>} Whether the prompt was shown
 */
function initRatingPrompt(timeoutMs = RATING_PROMPT_WAIT_MS) {
  if (!ratingPromptLoad) {
    ratingPromptLoad = waitForLogbookHeader(timeoutMs).then(async header => {
      if (!header || !header.parentNode.querySelector('.gcfl-friends-log, .gcfl-my-log')) {
        return false;
      }
      if (!(await recordRatingPromptUse())) {
        return false;
      }
      renderRatingPrompt(header);
      return true;
    });
  }
  return ratingPromptLoad;
}

console.log('[Friends Logs] Content script loaded');
doInject();
initRatingPrompt();

// Handle pages restored from bfcache (back/forward cache)
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    console.log('[Friends Logs] Page restored from bfcache');

    // If injected content was preserved by bfcache, no action needed
    if (document.querySelector('.gcfl-header')) {
      console.log('[Friends Logs] Content preserved, skipping re-injection');
      return;
    }

    // Content was lost (some browsers discard injected content), re-inject
    console.log('[Friends Logs] Content lost, re-injecting');
    const old = document.getElementById('inject');
    if (old) {
      old.remove();
    }
    doInject();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { injectScript, doInject, initRatingPrompt };
}
