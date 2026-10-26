const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const {
  launchChromiumWithExtension,
  setExtensionStorage,
  getExtensionStorage
} = require('./helpers/extension');
const {
  friendsLogsResponse,
  layoutFriendsLogsResponse,
  layoutPersonalLogsResponse
} = require('./fixtures/mock-api-responses');

const MOCK_PAGE_PATH = path.resolve(__dirname, 'fixtures', 'mock-geocache-page.html');
const mockPageHTML = fs.readFileSync(MOCK_PAGE_PATH, 'utf-8');
const LAYOUT_PAGE_PATH = path.resolve(__dirname, 'fixtures', 'mock-logbook-layout.html');
const layoutPageHTML = fs.readFileSync(LAYOUT_PAGE_PATH, 'utf-8');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');

/** Serve the logbook layout fixture, with friend logs or my logs depending on sp. */
async function setupLayoutRoutes(page) {
  await page.route('**/geocache/GC*', async route => {
    await route.fulfill({ status: 200, contentType: 'text/html', body: layoutPageHTML });
  });
  await page.route('**/seek/geocache.logbook*', async route => {
    const params = new URL(route.request().url()).searchParams;
    const response =
      params.get('sp') === 'true' ? layoutPersonalLogsResponse : layoutFriendsLogsResponse;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response)
    });
  });
}

/** Toggle "Show my logs" in the popup. */
async function toggleMyLogs(context, extensionId) {
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForTimeout(300);
  await popupPage.locator('label:has(#own)').click();
  await popupPage.waitForTimeout(500);
  await popupPage.close();
}

/**
 * Read the RGB of one page pixel from a real screenshot, so the check sees what is painted.
 * @returns {Promise<number[]>}
 */
async function pixelAt(page, x, y) {
  const png = await page.screenshot({
    clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 }
  });
  return page.evaluate(async b64 => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
  }, png.toString('base64'));
}

function isWhite(rgb) {
  return rgb.every(c => c >= 250);
}

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
    // Every cache page with logs counts as a use. Keep the one-time rating prompt (#135)
    // out of the other tests; its own tests reset it.
    await setExtensionStorage(context, extensionId, { ratingPromptDone: true });
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

  /**
   * Open the logbook layout fixture with friend logs and my logs, then run check(page).
   * Saves a screenshot of our table as tests/e2e/screenshots/<shot>.
   */
  async function withLayoutPage(shot, check) {
    await toggleMyLogs(context, extensionId);
    const page = await context.newPage();
    try {
      await page.setViewportSize({ width: 1100, height: 900 });
      await setupLayoutRoutes(page);
      await page.goto('https://www.geocaching.com/geocache/GC12345');
      await expect(page.locator('.gcfl-logbook-header')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.gcfl-friends-log')).toHaveCount(2);
      await expect(page.locator('.gcfl-my-log')).toHaveCount(1);
      await page.mouse.move(0, 0);
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page.locator('table.gcfl-table').screenshot({ path: path.join(SCREENSHOTS_DIR, shot) });
      await check(page);
    } finally {
      await page.close();
      await toggleMyLogs(context, extensionId);
    }
  }

  test('friend and my log highlight fills the whole row (#141)', async () => {
    await withLayoutPage('logbook-layout-141.png', async page => {
      const table = await page.locator('table.gcfl-table').boundingBox();
      const rows = page.locator('.gcfl-friends-log, .gcfl-my-log');
      for (let i = 0; i < (await rows.count()); i++) {
        const row = rows.nth(i);
        const cell = await row.locator('> td').boundingBox();
        // The row's only cell spans the whole table, not one of two columns.
        expect(Math.abs(cell.x + cell.width - (table.x + table.width))).toBeLessThanOrEqual(2);
        // The tint is painted near the right edge of the row, at rest and on hover.
        const x = table.x + table.width - 20;
        const y = cell.y + cell.height / 2;
        expect(isWhite(await pixelAt(page, x, y))).toBe(false);
        await row.hover();
        expect(isWhite(await pixelAt(page, x, y))).toBe(false);
        await page.mouse.move(0, 0);
      }
    });
  });

  test('sections keep a white gap before the next header (#141)', async () => {
    await withLayoutPage('logbook-layout-141.png', async page => {
      const table = await page.locator('table.gcfl-table').boundingBox();
      for (const header of ['.gcfl-my-header', '.gcfl-logbook-header']) {
        const gap = await page.evaluate(selector => {
          const headerRow = document.querySelector(selector).getBoundingClientRect();
          const rowsAbove = Array.from(
            document.querySelectorAll('.gcfl-friends-log, .gcfl-my-log')
          ).filter(r => r.getBoundingClientRect().bottom <= headerRow.top + 1);
          const last = rowsAbove[rowsAbove.length - 1].getBoundingClientRect();
          return { top: last.bottom, bottom: headerRow.top };
        }, header);
        const height = gap.bottom - gap.top;
        // The README screenshot has about 28px between a section's last row and the next header.
        expect(height).toBeGreaterThanOrEqual(16);
        expect(height).toBeLessThanOrEqual(40);
        expect(isWhite(await pixelAt(page, table.x + table.width / 2, gap.top + height / 2))).toBe(
          true
        );
      }
    });
  });

  test.describe('rating prompt (#135)', () => {
    const CHROME_STORE =
      'https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam';

    /** Start the count at `uses` cache pages with logs, prompt not done yet. */
    async function resetPrompt(uses) {
      await setExtensionStorage(context, extensionId, {
        ratingPromptUses: uses,
        ratingPromptDone: false
      });
    }

    /** Open a cache page with friend logs and wait until the extension has rendered them. */
    async function openCachePage() {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1100, height: 900 });
      await setupRoutes(page);
      await page.goto('https://www.geocaching.com/geocache/GC12345');
      await expect(page.locator('.gcfl-logbook-header td')).toBeVisible({ timeout: 10000 });
      return page;
    }

    /** Wait until the content script has saved this page load's use. */
    async function expectUses(uses) {
      await expect
        .poll(async () => (await getExtensionStorage(context, extensionId)).ratingPromptUses)
        .toBe(uses);
    }

    test.afterAll(async () => {
      await setExtensionStorage(context, extensionId, { ratingPromptDone: true });
    });

    test('shows on the 5th cache page with logs, above the Logbook header', async () => {
      await resetPrompt(3);

      const fourth = await openCachePage();
      await expectUses(4);
      await expect(fourth.locator('.gcfl-rating-prompt')).toHaveCount(0);
      await fourth.close();

      const fifth = await openCachePage();
      const prompt = fifth.locator('.gcfl-rating-prompt');
      await expect(prompt).toBeVisible();
      await expect(prompt.locator('.gcfl-rating-text')).toHaveText(
        'Is Friends Logs useful to you? A quick rating on the store helps other geocachers find it.'
      );
      await expect(prompt.locator('.gcfl-rating-rate')).toHaveText('Rate it');
      await expect(prompt.locator('.gcfl-rating-dismiss')).toHaveText('Not now');
      await expect(prompt.locator('.gcfl-rating-rate')).toHaveAttribute('href', CHROME_STORE);
      await expect(prompt.locator('.gcfl-rating-rate')).toHaveAttribute('target', '_blank');

      // Under the last friend log, above the Logbook header.
      const box = await prompt.boundingBox();
      const lastFriend = await fifth.locator('.gcfl-friends-log').last().boundingBox();
      const logbook = await fifth.locator('.gcfl-logbook-header td').boundingBox();
      expect(box.y).toBeGreaterThanOrEqual(lastFriend.y + lastFriend.height);
      expect(box.y + box.height).toBeLessThanOrEqual(logbook.y);

      await fifth.mouse.move(0, 0);
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await fifth
        .locator('table.gcfl-table')
        .screenshot({ path: path.join(SCREENSHOTS_DIR, 'rating-prompt-135.png') });
      await fifth.close();

      // Not clicked on the 5th, so the 6th does not show it again.
      const sixth = await openCachePage();
      await expectUses(6);
      await expect(sixth.locator('.gcfl-rating-prompt')).toHaveCount(0);
      await sixth.close();
    });

    test('"Not now" hides it for good', async () => {
      await resetPrompt(4);
      const page = await openCachePage();
      await page.locator('.gcfl-rating-dismiss').click();
      await expect(page.locator('.gcfl-rating-prompt')).toHaveCount(0);
      await expect
        .poll(async () => (await getExtensionStorage(context, extensionId)).ratingPromptDone)
        .toBe(true);

      await setExtensionStorage(context, extensionId, { ratingPromptUses: 4 });
      await page.reload();
      await expect(page.locator('.gcfl-logbook-header td')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.gcfl-rating-prompt')).toHaveCount(0);
      await page.close();
    });

    test('"Rate it" opens the store in a new tab and hides it for good', async () => {
      await resetPrompt(4);
      const page = await openCachePage();
      // Abort the store request in the new tab so the test stays offline.
      const storeRequest = context.waitForEvent('request', request =>
        request.url().startsWith('https://chrome.google.com/')
      );
      await context.route('https://chrome.google.com/**', route => route.abort());
      try {
        const [store] = await Promise.all([
          context.waitForEvent('page'),
          page.locator('.gcfl-rating-rate').click()
        ]);
        expect((await storeRequest).url()).toBe(CHROME_STORE);
        await store.close();
      } finally {
        await context.unroute('https://chrome.google.com/**');
      }
      await expect(page.locator('.gcfl-rating-prompt')).toHaveCount(0);
      await expect
        .poll(async () => (await getExtensionStorage(context, extensionId)).ratingPromptDone)
        .toBe(true);
      await page.close();
    });
  });

  test.describe('error banner (#87)', () => {
    const MANIFEST_VERSION = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '..', '..', 'manifest.json'), 'utf-8')
    ).version;

    /** Open a cache page whose logbook request fails with HTTP 500. */
    async function openFailingPage() {
      const page = await context.newPage();
      await page.setViewportSize({ width: 1100, height: 900 });
      await page.route('**/geocache/GC*', route =>
        route.fulfill({ status: 200, contentType: 'text/html', body: mockPageHTML })
      );
      await page.route('**/seek/geocache.logbook*', route =>
        route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' })
      );
      await page.goto('https://www.geocaching.com/geocache/GC12345_test-cache');
      return page;
    }

    test('shows above the site logbook when the logbook request fails', async () => {
      const page = await openFailingPage();
      const banner = page.locator('.gcfl-error-banner');
      await expect(banner).toBeVisible({ timeout: 10000 });
      await expect(banner.locator('strong')).toHaveText("Friends Logs couldn't load on this page.");
      await expect(banner.locator('.gcfl-error-dismiss')).toHaveText('Dismiss');

      const report = banner.locator('.gcfl-error-report');
      await expect(report).toHaveText('Report issue');
      const href = new URL(await report.getAttribute('href'));
      expect(href.origin + href.pathname).toBe(
        'https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/new'
      );
      expect(href.searchParams.get('title')).toBe(
        `Friends Logs did not load (v${MANIFEST_VERSION})`
      );
      // The fixture's $.getJSON stub reports a failure without an HTTP status.
      expect(href.searchParams.get('body')).toContain('- Failure: logbook request failed (');
      expect(href.searchParams.get('body')).toContain('- Page: /geocache/GC12345\n');
      expect(href.searchParams.get('body')).toMatch(/- Browser: Chrome \d+ on /);

      const box = await banner.boundingBox();
      const siteLogbook = await page.locator('#cache_logs_table').boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(siteLogbook.y);

      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
      await page
        .locator('table.gcfl-table')
        .screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-banner-87.png') });

      await banner.locator('.gcfl-error-dismiss').click();
      await expect(page.locator('.gcfl-error-banner')).toHaveCount(0);
      await expect(page.locator('#cache_logs_table')).toBeVisible();
      await page.close();
    });

    test('stays hidden when the logs load', async () => {
      const page = await context.newPage();
      await setupRoutes(page);
      await page.goto('https://www.geocaching.com/geocache/GC12345');
      await expect(page.locator('.gcfl-logbook-header td')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.gcfl-error-banner')).toHaveCount(0);
      await page.close();
    });
  });
});
