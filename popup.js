/**
 * Popup script for extension settings.
 * Handles loading and saving user preferences.
 */

const DEFAULT_VALUES = {
  showFriendsLogs: true,
  showMyLogs: false,
  limit: 5
};

document.addEventListener('DOMContentLoaded', () => {
  const friendsCheckbox = document.getElementById('friends');
  const ownCheckbox = document.getElementById('own');
  const limitSelect = document.getElementById('limit');

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
