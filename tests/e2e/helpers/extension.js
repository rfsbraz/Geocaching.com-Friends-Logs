const path = require('path');
const { chromium } = require('@playwright/test');
const { withExtension } = require('playwright-webextext');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..', '..');

/**
 * Launch Chromium with the extension loaded.
 * Returns a persistent browser context and the extension ID.
 *
 * Since this extension has no background/service worker, we discover
 * the extension ID by navigating to chrome://extensions.
 */
async function launchChromiumWithExtension() {
  const browserType = withExtension(chromium, EXTENSION_PATH);
  const context = await browserType.launchPersistentContext('', {
    headless: false
  });

  // Discover extension ID from chrome://extensions page
  const extPage = await context.newPage();
  await extPage.goto('chrome://extensions');

  // The extension ID is in the extensions-manager shadow DOM
  const extensionId = await extPage.evaluate(() => {
    const manager = document.querySelector('extensions-manager');
    if (!manager || !manager.shadowRoot) {
      return null;
    }
    const itemList = manager.shadowRoot.querySelector('extensions-item-list');
    if (!itemList || !itemList.shadowRoot) {
      return null;
    }
    const item = itemList.shadowRoot.querySelector('extensions-item');
    if (!item) {
      return null;
    }
    return item.id;
  });

  await extPage.close();

  return { context, extensionId };
}

/**
 * Read or write the extension's chrome.storage.local from one of its own pages.
 * @param {import('@playwright/test').BrowserContext} context
 * @param {string} extensionId
 * @param {(items: object | null) => Promise<object>} fn - Runs in the extension page
 * @param {object | null} arg
 */
async function inExtensionStorage(context, extensionId, fn, arg = null) {
  const page = await context.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`);
    return await page.evaluate(fn, arg);
  } finally {
    await page.close();
  }
}

/** Write items to the extension's local storage. */
function setExtensionStorage(context, extensionId, items) {
  return inExtensionStorage(
    context,
    extensionId,
    values => chrome.storage.local.set(values).then(() => null),
    items
  );
}

/** Read the extension's whole local storage. */
function getExtensionStorage(context, extensionId) {
  return inExtensionStorage(context, extensionId, () => chrome.storage.local.get(null));
}

module.exports = {
  launchChromiumWithExtension,
  setExtensionStorage,
  getExtensionStorage,
  EXTENSION_PATH
};
