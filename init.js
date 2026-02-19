/**
 * Default values for extension settings.
 * Shared between content_script.js and popup.js.
 */
const DEFAULT_VALUES = {
  showFriendsLogs: true,
  showMyLogs: false,
  limit: 5
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DEFAULT_VALUES };
}
