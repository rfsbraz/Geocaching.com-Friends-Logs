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

module.exports = { launchChromiumWithExtension, EXTENSION_PATH };
