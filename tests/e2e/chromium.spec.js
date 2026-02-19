const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { launchChromiumWithExtension } = require('./helpers/extension');
const { friendsLogsResponse } = require('./fixtures/mock-api-responses');

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

test.describe('Chromium E2E', () => {
  /** @type {import('@playwright/test').BrowserContext} */
  let context;
  let extensionId;

  test.beforeAll(async () => {
    ({ context, extensionId } = await launchChromiumWithExtension());
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('content script injects on geocache URL', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');

    // Wait for the extension to inject friends logs header
    await expect(page.locator('.gcfl-friends-header td')).toBeVisible({ timeout: 10000 });

    // Verify friends logs header shows correct count
    await expect(page.locator('.gcfl-friends-header td')).toContainText('Friends Logs');

    // Verify the inject script element was created
    const injectScript = page.locator('script#inject');
    await expect(injectScript).toHaveCount(1);

    // Verify friend log rows were inserted (as tbody elements with class)
    const friendLogCount = await page.locator('.gcfl-friends-log').count();
    expect(friendLogCount).toBeGreaterThan(0);

    await page.close();
  });

  test('does not duplicate injection on same page', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header td')).toBeVisible({ timeout: 10000 });

    // There should be exactly one inject script element
    await expect(page.locator('script#inject')).toHaveCount(1);

    // There should be exactly one friends header
    await expect(page.locator('.gcfl-friends-header')).toHaveCount(1);

    await page.close();
  });

  test('API is called with correct parameters', async () => {
    const page = await context.newPage();
    const apiCalls = [];

    await page.route('**/geocache/GC*', async route => {
      const url = route.request().url();
      if (url.includes('/seek/geocache.logbook')) {
        apiCalls.push(new URL(url));
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
      apiCalls.push(new URL(route.request().url()));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(friendsLogsResponse)
      });
    });

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header td')).toBeVisible({ timeout: 10000 });

    // Verify at least one API call was made
    expect(apiCalls.length).toBeGreaterThan(0);

    // Verify the API call includes expected parameters
    const params = apiCalls[0].searchParams;
    expect(params.get('tkn')).toBe('mock-user-token-12345');
    expect(params.get('sf')).toBe('true');
    expect(params.get('num')).toBeTruthy();

    await page.close();
  });

  test('friend log rows contain data from API response', async () => {
    const page = await context.newPage();
    await setupRoutes(page);

    await page.goto('https://www.geocaching.com/geocache/GC12345');
    await expect(page.locator('.gcfl-friends-header td')).toBeVisible({ timeout: 10000 });

    // Verify exact count matches mock response (2 friends logs)
    await expect(page.locator('.gcfl-friends-log')).toHaveCount(friendsLogsResponse.data.length);

    // Verify Logbook header appears after friend logs
    await expect(page.locator('.gcfl-logbook-header td')).toBeVisible();

    await page.close();
  });

  test('popup UI loads with correct defaults', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Check that friends checkbox is checked by default
    await expect(popupPage.locator('#friends')).toBeChecked();

    // Check that own checkbox is unchecked by default
    await expect(popupPage.locator('#own')).not.toBeChecked();

    // Check that limit select has default value
    await expect(popupPage.locator('#limit')).toHaveValue('5');

    // Check version is displayed
    await expect(popupPage.locator('#version')).not.toBeEmpty();

    await popupPage.close();
  });

  test('settings persist across popup reload', async () => {
    const popupPage = await context.newPage();
    await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);

    // Toggle checkbox via its label (the input is visually hidden with CSS toggle)
    await popupPage.locator('label:has(#own)').click();
    await popupPage.locator('#limit').selectOption('10');

    // Wait for storage to persist
    await popupPage.waitForTimeout(500);

    // Reload popup
    await popupPage.reload();

    // Verify settings persisted
    await expect(popupPage.locator('#own')).toBeChecked();
    await expect(popupPage.locator('#limit')).toHaveValue('10');

    // Reset settings for other tests
    await popupPage.locator('label:has(#own)').click();
    await popupPage.locator('#limit').selectOption('5');
    await popupPage.waitForTimeout(500);

    await popupPage.close();
  });
});
