/**
 * Default values for extension settings.
 * Shared between content_script.js and popup.js.
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_VALUES, STORE_URLS, detectBrowser, getStoreUrl };
}
