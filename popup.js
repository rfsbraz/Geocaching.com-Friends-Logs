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
  opera: 'https://addons.opera.com/extensions/details/geocaching-friends-logs/',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/geocachingcom-friends-logs/YOUR_EDGE_EXTENSION_ID'
};

/**
 * Detects the current browser
 * @returns {string} Browser name: 'firefox', 'edge', 'opera', or 'chrome'
 */
function detectBrowser() {
  const ua = navigator.userAgent;
  if (typeof browser !== 'undefined' && browser.runtime) {
    // Firefox uses 'browser' namespace natively
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
 * Updates the rate link to point to the correct store
 */
function updateRateLink() {
  const rateLink = document.getElementById('rate-link');
  if (rateLink) {
    const detectedBrowser = detectBrowser();
    rateLink.href = STORE_URLS[detectedBrowser] || STORE_URLS.chrome;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const friendsCheckbox = document.getElementById('friends');
  const ownCheckbox = document.getElementById('own');
  const limitSelect = document.getElementById('limit');

  // Update rate link to correct store
  updateRateLink();

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
