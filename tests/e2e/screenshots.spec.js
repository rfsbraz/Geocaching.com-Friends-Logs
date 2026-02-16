const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { launchChromiumWithExtension } = require('./helpers/extension');
const { friendsLogsResponse, personalLogsResponse } = require('./fixtures/mock-api-responses');
const { discoverRealPages, prepareRealPage } = require('./helpers/real-page');

const MOCK_PAGE_PATH = path.resolve(__dirname, 'fixtures', 'mock-geocache-page.html');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const mockPageHTML = fs.readFileSync(MOCK_PAGE_PATH, 'utf-8');

/** Route handler that returns friends-only data. */
async function setupFriendsOnlyRoutes(page) {
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

/**
 * Route handler that differentiates friends vs personal API calls.
 * When both are requested, inject.js calls friends first (sf=true, sp=false),
 * then personal (sf=false, sp=true) sequentially.
 */
async function setupBothLogsRoutes(page) {
  await page.route('**/geocache/GC*', async route => {
    const url = route.request().url();
    if (url.includes('/seek/geocache.logbook')) {
      const params = new URL(url).searchParams;
      const response = params.get('sp') === 'true' ? personalLogsResponse : friendsLogsResponse;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response)
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
    const params = new URL(route.request().url()).searchParams;
    const response = params.get('sp') === 'true' ? personalLogsResponse : friendsLogsResponse;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/** Save screenshot to disk and attach to Playwright test report. */
async function capture(page, testInfo, name, options) {
  const filePath = path.join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: filePath, ...options });
  await testInfo.attach(name.replace('.png', ''), {
    path: filePath,
    contentType: 'image/png'
  });
}

test.describe('Visual Screenshots', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  let extensionId;

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    ({ context, extensionId } = await launchChromiumWithExtension());
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('capture popup with default settings', async () => {
    const popupPage = await context.newPage();
    await popupPage.setViewportSize({ width: 360, height: 500 });
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForTimeout(500);

    await expect(popupPage.locator('#friends')).toBeChecked();
    await expect(popupPage.locator('#own')).not.toBeChecked();

    await capture(popupPage, test.info(), 'popup-default.png');

    await popupPage.close();
  });

  test('capture popup with all settings enabled', async () => {
    const popupPage = await context.newPage();
    await popupPage.setViewportSize({ width: 360, height: 500 });
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForTimeout(300);

    await popupPage.locator('label:has(#own)').click();
    await popupPage.locator('#limit').selectOption('10');
    await popupPage.waitForTimeout(300);

    await expect(popupPage.locator('#own')).toBeChecked();

    await capture(popupPage, test.info(), 'popup-all-enabled.png');

    // Reset for subsequent tests
    await popupPage.locator('label:has(#own)').click();
    await popupPage.locator('#limit').selectOption('5');
    await popupPage.waitForTimeout(300);

    await popupPage.close();
  });

  test('capture geocache page with friends logs only', async () => {
    const page = await context.newPage();
    await setupFriendsOnlyRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify the friends logs rendered correctly
    await expect(page.locator('.gcfl-friends-header')).toContainText('2 Friends Logs');
    await expect(page.locator('.gcfl-friends-log')).toHaveCount(2);
    await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

    await capture(page, test.info(), 'page-friends-logs.png', { fullPage: true });

    await page.close();
  });

  test('capture geocache page with friends + my logs', async () => {
    // Enable "Show my logs" via the popup
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await popupPage.waitForTimeout(300);
    await popupPage.locator('label:has(#own)').click();
    await popupPage.waitForTimeout(500);
    await expect(popupPage.locator('#own')).toBeChecked();
    await popupPage.close();

    // Now load the geocache page — extension should request both
    const page = await context.newPage();
    await setupBothLogsRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 10000 });

    // Wait for personal logs to load (they come second)
    await expect(page.locator('.gcfl-my-header')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Verify both sections rendered
    await expect(page.locator('.gcfl-friends-header')).toContainText('2 Friends Logs');
    await expect(page.locator('.gcfl-friends-log')).toHaveCount(2);
    await expect(page.locator('.gcfl-my-header')).toContainText('My Log');
    await expect(page.locator('.gcfl-my-log')).toHaveCount(1);
    await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

    await capture(page, test.info(), 'page-friends-and-my-logs.png', { fullPage: true });

    await page.close();

    // Reset: disable "Show my logs"
    const resetPage = await context.newPage();
    await resetPage.goto(`chrome-extension://${extensionId}/popup.html`);
    await resetPage.waitForTimeout(300);
    await resetPage.locator('label:has(#own)').click();
    await resetPage.waitForTimeout(500);
    await resetPage.close();
  });

  // --- Real page screenshots (conditional, local-only) ---

  const realPages = discoverRealPages();

  for (const htmlFile of realPages) {
    const gcMatch = htmlFile.match(/GC[A-Z0-9]+/i);
    const gcCode = gcMatch ? gcMatch[0].toUpperCase() : 'GCTEST';

    test(`capture real page with friends logs: ${gcCode}`, async () => {
      const { htmlContent } = prepareRealPage(htmlFile);

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

      await page.goto(`https://www.geocaching.com/geocache/${gcCode}`);
      await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(500);

      await expect(page.locator('.gcfl-friends-header')).toContainText(/Friends? Log/);
      await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

      await capture(page, test.info(), `real-page-${gcCode}-friends.png`, { fullPage: true });

      await page.close();
    });

    test(`capture real page with friends + my logs: ${gcCode}`, async () => {
      // Enable "Show my logs"
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await popupPage.waitForTimeout(300);
      await popupPage.locator('label:has(#own)').click();
      await popupPage.waitForTimeout(500);
      await expect(popupPage.locator('#own')).toBeChecked();
      await popupPage.close();

      const { htmlContent } = prepareRealPage(htmlFile);

      const page = await context.newPage();

      await page.route(`**/geocache/${gcCode}`, async route => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: htmlContent
        });
      });

      await page.route('**/seek/geocache.logbook*', async route => {
        const params = new URL(route.request().url()).searchParams;
        const response = params.get('sp') === 'true' ? personalLogsResponse : friendsLogsResponse;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        });
      });

      await page.goto(`https://www.geocaching.com/geocache/${gcCode}`);
      await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.gcfl-my-header')).toBeVisible({ timeout: 10000 });
      await page.waitForTimeout(500);

      await expect(page.locator('.gcfl-friends-header')).toContainText(/Friends? Log/);
      await expect(page.locator('.gcfl-my-header')).toContainText('My Log');
      await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

      await capture(page, test.info(), `real-page-${gcCode}-all.png`, { fullPage: true });

      await page.close();

      // Reset: disable "Show my logs"
      const resetPage = await context.newPage();
      await resetPage.goto(`chrome-extension://${extensionId}/popup.html`);
      await resetPage.waitForTimeout(300);
      await resetPage.locator('label:has(#own)').click();
      await resetPage.waitForTimeout(500);
      await resetPage.close();
    });
  }
});
