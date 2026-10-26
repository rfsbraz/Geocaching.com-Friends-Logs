/**
 * Popup script for extension settings.
 * Handles loading and saving user preferences.
 */

/* global DEFAULT_VALUES, getStoreUrl */

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
 * Displays the extension version in the footer
 */
function displayVersion() {
  const versionElement = document.getElementById('version');
  if (versionElement) {
    const manifest = chrome.runtime.getManifest();
    versionElement.textContent = `v${manifest.version}`;
  }
}

/**
 * Replaces the English text of every [data-i18n] element with the message for the
 * browser's language. data-i18n-args holds the substitutions, comma separated.
 * Elements keep their English text when a message is missing.
 * @param {Document|Element} root
 */
function localizePopup(root) {
  root.querySelectorAll('[data-i18n]').forEach(el => {
    const args = el.dataset.i18nArgs ? el.dataset.i18nArgs.split(',') : undefined;
    const message = chrome.i18n.getMessage(el.dataset.i18n, args);
    if (message) {
      el.textContent = message;
    }
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { updateRateLink, displayVersion, localizePopup };
}

document.addEventListener('DOMContentLoaded', () => {
  const friendsCheckbox = document.getElementById('friends');
  const ownCheckbox = document.getElementById('own');
  const limitSelect = document.getElementById('limit');

  localizePopup(document);

  // Update rate link to correct store
  updateRateLink();

  // Display extension version
  displayVersion();

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
