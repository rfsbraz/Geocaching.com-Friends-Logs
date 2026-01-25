/* global DEFAULT_VALUES */

/**
 * Popup script for extension settings.
 */

window.addEventListener('DOMContentLoaded', function () {
  const friends = $('#friends');
  const own = $('#own');
  const limit = $('#limit');

  // Load saved settings
  chrome.storage.local.get(DEFAULT_VALUES, function (items) {
    // Friends logs checkbox
    if (items.showFriendsLogs) {
      friends.iCheck('check');
    } else {
      friends.iCheck('uncheck');
    }

    // My logs checkbox
    if (items.showMyLogs) {
      own.iCheck('check');
    } else {
      own.iCheck('uncheck');
    }

    // Limit dropdown
    limit.val(items.limit || 5);
  });

  // Save settings on change
  friends.on('ifChecked', function () {
    chrome.storage.local.set({ showFriendsLogs: true });
  });

  friends.on('ifUnchecked', function () {
    chrome.storage.local.set({ showFriendsLogs: false });
  });

  own.on('ifChecked', function () {
    chrome.storage.local.set({ showMyLogs: true });
  });

  own.on('ifUnchecked', function () {
    chrome.storage.local.set({ showMyLogs: false });
  });

  limit.on('change', function () {
    chrome.storage.local.set({ limit: parseInt(limit.val(), 10) });
  });
});
