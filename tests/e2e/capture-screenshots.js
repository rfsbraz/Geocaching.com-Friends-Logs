/**
 * Captures screenshots of the extension UI for visual validation.
 * Run: node tests/e2e/capture-screenshots.js
 *
 * Outputs PNG files to tests/e2e/screenshots/
 */

const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { withExtension } = require('playwright-webextext');
const { friendsLogsResponse } = require('./fixtures/mock-api-responses');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const MOCK_PAGE_PATH = path.resolve(__dirname, 'fixtures', 'mock-geocache-page.html');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const mockPageHTML = fs.readFileSync(MOCK_PAGE_PATH, 'utf-8');

async function setupRoutes(page) {
  await page.route('**/geocache/GC*', async route => {
    const url = route.request().url();
    if (url.includes('/seek/geocache.logbook')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(friendsLogsResponse)
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: mockPageHTML
      });
    }
  });

  await page.route('**/seek/geocache.logbook*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(friendsLogsResponse)
    });
  });
}

async function discoverExtensionId(context) {
  const extPage = await context.newPage();
  await extPage.goto('chrome://extensions');
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
    return item ? item.id : null;
  });
  await extPage.close();
  return extensionId;
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  console.log('Launching Chromium with extension...');
  const browserType = withExtension(chromium, EXTENSION_PATH);
  const context = await browserType.launchPersistentContext('', {
    headless: false,
    viewport: { width: 1280, height: 900 }
  });

  try {
    // --- Screenshot 1: Geocache page with friends logs ---
    console.log('Capturing geocache page with friends logs...');
    const page = await context.newPage();
    await setupRoutes(page);
    await page.goto('https://www.geocaching.com/geocache/GC12345');

    // Wait for extension to inject
    await page.locator('.gcfl-friends-header').waitFor({ state: 'visible', timeout: 15000 });

    // Small delay to let styles settle
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'geocache-page-friends-logs.png'),
      fullPage: true
    });
    console.log('  Saved: geocache-page-friends-logs.png');

    // Focused screenshot of just the log area
    const logContainer = page.locator('#cache_logs_container');
    if ((await logContainer.count()) > 0) {
      // Take a wider crop — include the headers and first few log rows
      const logTable = page.locator('#cache_logs_table');
      const containerBox = await logContainer.boundingBox();
      const tableBox = await logTable.boundingBox();

      if (containerBox && tableBox) {
        const clipY = Math.max(0, containerBox.y - 10);
        const clipBottom = tableBox.y + tableBox.height + 10;
        await page.screenshot({
          path: path.join(SCREENSHOTS_DIR, 'friends-logs-detail.png'),
          clip: {
            x: Math.max(0, containerBox.x - 20),
            y: clipY,
            width: Math.min(containerBox.width + 40, 1280),
            height: clipBottom - clipY
          }
        });
        console.log('  Saved: friends-logs-detail.png');
      }
    }

    await page.close();

    // --- Screenshot 2: Popup UI ---
    console.log('Capturing popup UI...');
    const extensionId = await discoverExtensionId(context);
    if (extensionId) {
      const popupPage = await context.newPage();
      await popupPage.setViewportSize({ width: 360, height: 500 });
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await popupPage.waitForTimeout(500);

      await popupPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'popup-default.png')
      });
      console.log('  Saved: popup-default.png');

      // Toggle "Show my logs" on for a second screenshot
      await popupPage.locator('label:has(#own)').click();
      await popupPage.locator('#limit').selectOption('10');
      await popupPage.waitForTimeout(300);

      await popupPage.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'popup-custom-settings.png')
      });
      console.log('  Saved: popup-custom-settings.png');

      // Reset settings
      await popupPage.locator('label:has(#own)').click();
      await popupPage.locator('#limit').selectOption('5');
      await popupPage.waitForTimeout(300);

      await popupPage.close();
    } else {
      console.warn('  Could not discover extension ID, skipping popup screenshots');
    }

    console.log('\nDone! Screenshots saved to tests/e2e/screenshots/');
  } finally {
    await context.close();
  }
}

main().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
