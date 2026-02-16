const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { launchChromiumWithExtension } = require('./helpers/extension');
const { friendsLogsResponse } = require('./fixtures/mock-api-responses');
const { discoverRealPages, prepareRealPage } = require('./helpers/real-page');

const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const htmlFiles = discoverRealPages();

test.describe('Real Page Tests', () => {
  // Skip entire suite if no real pages available
  test.skip(htmlFiles.length === 0, 'No HTML files in tests/e2e/fixtures/real-pages/');

  /** @type {import('@playwright/test').BrowserContext} */
  let context;

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    ({ context } = await launchChromiumWithExtension());
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  for (const htmlFile of htmlFiles) {
    test(`extension renders on real page: ${htmlFile}`, async () => {
      const { htmlContent, gcCode } = prepareRealPage(htmlFile);

      const page = await context.newPage();

      await page.route(`**/geocache/${gcCode}`, async route => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: htmlContent
        });
      });

      await page.route('**/seek/geocache.logbook*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(friendsLogsResponse)
        });
      });

      const consoleLogs = [];
      page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

      await page.goto(`https://www.geocaching.com/geocache/${gcCode}`);

      await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      const extensionLogs = consoleLogs.filter(l => l.includes('Friends Logs'));
      if (extensionLogs.length > 0) {
        console.log('Extension logs:', extensionLogs.join('\n'));
      }

      // Verify friends logs rendered
      await expect(page.locator('.gcfl-friends-header')).toContainText(/Friends? Log/);
      const friendLogCount = await page.locator('.gcfl-friends-log').count();
      expect(friendLogCount).toBeGreaterThan(0);
      await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

      // Screenshot
      const screenshotName = `real-page-${gcCode}.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach(screenshotName.replace('.png', ''), {
        path: screenshotPath,
        contentType: 'image/png'
      });

      await page.close();
    });
  }
});
