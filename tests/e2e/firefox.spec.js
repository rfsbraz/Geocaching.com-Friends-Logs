const path = require('path');
const os = require('os');
const fs = require('fs');
const { test, expect, firefox } = require('@playwright/test');
const { withExtension } = require('playwright-webextext');
const { friendsLogsResponse } = require('./fixtures/mock-api-responses');

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const MOCK_PAGE_PATH = path.resolve(__dirname, 'fixtures', 'mock-geocache-page.html');
const mockPageHTML = fs.readFileSync(MOCK_PAGE_PATH, 'utf-8');

/** Set up page routes for intercepting geocache page and API calls. */
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

test.describe('Firefox E2E', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;

  let profileDir;

  test.beforeAll(async () => {
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'firefox-test-'));
    const browserType = withExtension(firefox, EXTENSION_PATH);
    context = await browserType.launchPersistentContext(profileDir, {
      headless: false
    });
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
    // Clean up temp profile
    if (profileDir) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  });

  test('content script injects on geocache URL', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');

    // Wait for the extension to inject friends logs header
    await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 10000 });

    // Verify friends logs header shows correct count
    await expect(page.locator('.gcfl-friends-header')).toContainText('Friends Logs');

    // Verify the inject script element was created
    await expect(page.locator('script#inject')).toHaveCount(1);

    // Verify friend log rows were inserted
    const friendLogCount = await page.locator('.gcfl-friends-log').count();
    expect(friendLogCount).toBeGreaterThan(0);

    await page.close();
  });

  test('friend log rows match API response count', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 10000 });

    // Verify exact count matches mock response
    await expect(page.locator('.gcfl-friends-log')).toHaveCount(friendsLogsResponse.data.length);

    // Verify Logbook header appears after friend logs
    await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

    await page.close();
  });

  test('does not duplicate injection on same page', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 10000 });

    // There should be exactly one inject script element
    await expect(page.locator('script#inject')).toHaveCount(1);

    // There should be exactly one friends header
    await expect(page.locator('.gcfl-friends-header')).toHaveCount(1);

    await page.close();
  });
});
