/**
 * Popup script for extension settings.
 * Handles loading and saving user preferences.
 */

const DEFAULT_VALUES = {
  showFriendsLogs: true,
  showMyLogs: false,
  limit: 5
};

/**
 * Store URLs for each browser
 */
const STORE_URLS = {
  chrome:
    'https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam',
  firefox: 'https://addons.mozilla.org/firefox/addon/geocaching-com-friends-logs/',
  opera:
    'https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/ddbfbobfccafkoabbcmpkbpofbkfgikc'
};

/**
 * Detects the current browser
 * @returns {string} Browser name: 'firefox', 'edge', 'opera', or 'chrome'
 */
function detectBrowser() {
  const ua = navigator.userAgent;
  // Check the user agent, not the `browser` namespace: recent Chromium
  // versions expose `browser` to extensions too.
  if (ua.includes('Firefox/')) {
    return 'firefox';
  }
  if (ua.includes('Edg/')) {
    return 'edge';
  }
  if (ua.includes('OPR/') || ua.includes('Opera')) {
    return 'opera';
  }
  return 'chrome';
}

/**
 * Returns the store page for the current browser
 * @returns {string} Store URL
 */
function getStoreUrl() {
  return STORE_URLS[detectBrowser()] || STORE_URLS.chrome;
}

/**
 * Updates the rate link to point to the correct store
 */
function updateRateLink() {
  const rateLink = document.getElementById('rate-link');
  if (rateLink) {
    rateLink.href = getStoreUrl();
  }
}

/**
 * How long the extension must have been in use before the rating prompt shows
 */
const RATING_PROMPT_DELAY_MS = 21 * 24 * 60 * 60 * 1000;

/**
 * Shows the one-time rating prompt once the extension has been used for
 * RATING_PROMPT_DELAY_MS. After "Rate it" or "Not now" it never shows again.
 * @param {number} now - Current time in milliseconds
 * @returns {Promise<void>}
 */
function initRatingPrompt(now = Date.now()) {
  return new Promise(resolve => {
    chrome.storage.local.get({ firstUsedAt: null, ratingPromptDone: false }, items => {
      const prompt = document.getElementById('rating-prompt');
      if (!prompt || items.ratingPromptDone) {
        resolve();
        return;
      }
      if (!items.firstUsedAt) {
        chrome.storage.local.set({ firstUsedAt: now }, () => resolve());
        return;
      }
      if (now - items.firstUsedAt < RATING_PROMPT_DELAY_MS) {
        resolve();
        return;
      }

      const text = document.getElementById('rating-prompt-text');
      const rate = document.getElementById('rating-prompt-rate');
      const dismiss = document.getElementById('rating-prompt-dismiss');
      text.textContent = chrome.i18n.getMessage('ratingPromptText');
      rate.textContent = chrome.i18n.getMessage('ratingPromptRate');
      dismiss.textContent = chrome.i18n.getMessage('ratingPromptDismiss');
      rate.href = getStoreUrl();

      const done = () => {
        prompt.hidden = true;
        chrome.storage.local.set({ ratingPromptDone: true });
      };
      rate.addEventListener('click', done);
      dismiss.addEventListener('click', done);

      prompt.hidden = false;
      resolve();
    });
  });
}

/**
 * Displays the extension version in the footer
 */
function displayVersion() {
  const versionElement = document.getElementById('version');
  if (versionElement) {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_VALUES,
    STORE_URLS,
    RATING_PROMPT_DELAY_MS,
    detectBrowser,
    getStoreUrl,
    updateRateLink,
    displayVersion,
    initRatingPrompt
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const friendsCheckbox = document.getElementById('friends');
  const ownCheckbox = document.getElementById('own');
  const limitSelect = document.getElementById('limit');

  // Update rate link to correct store
  updateRateLink();

  // Display extension version
  displayVersion();

  // Ask for a store rating once, after a few weeks of use
  initRatingPrompt();

  // Load saved settings
  chrome.storage.local.get(DEFAULT_VALUES, items => {
    friendsCheckbox.checked = items.showFriendsLogs;
    ownCheckbox.checked = items.showMyLogs;
    limitSelect.value = items.limit || 5;
  });

  // Save settings on change
  friendsCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ showFriendsLogs: friendsCheckbox.checked });
  });

  ownCheckbox.addEventListener('change', () => {
    chrome.storage.local.set({ showMyLogs: ownCheckbox.checked });
  });

  limitSelect.addEventListener('change', () => {
    chrome.storage.local.set({ limit: parseInt(limitSelect.value, 10) });
  });
});
