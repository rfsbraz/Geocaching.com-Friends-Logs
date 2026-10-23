const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RATING_KEYS = ['ratingPromptText', 'ratingPromptRate', 'ratingPromptDismiss'];

const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/141.0';

function setUserAgent(userAgent) {
  Object.defineProperty(global, 'navigator', {
    value: { userAgent },
    writable: true,
    configurable: true
  });
}

function stored() {
  return new Promise(resolve => chrome.storage.local.get(null, resolve));
}

/**
 * The table inject.js leaves on a cache page. Each kind of row is a friend log or one of
 * my logs; the logbook header always comes last.
 */
function renderedLogsTable(rowClasses) {
  const rows = rowClasses.map(cls => `<tr class="log-row ${cls}"><td>log</td></tr>`).join('');
  const rowsBody = rows
    ? `<tbody class="gcfl-rows">${rows}<tr class="gcfl-spacer"><td></td></tr></tbody>`
    : '';
  return (
    '<table class="LogsTable gcfl-table">' +
    `<tbody class="gcfl-header gcfl-friends-header"><tr><td>${rowClasses.length} Friends Logs</td></tr></tbody>` +
    rowsBody +
    '<tbody class="gcfl-header gcfl-logbook-header"><tr><td>Logbook</td></tr></tbody>' +
    '</table><table class="LogsTable" id="cache_logs_table"></table>'
  );
}

/**
 * One cache page load: the page is in place, the content script loads fresh and decides.
 * @param {string} html - Page body
 * @returns {Promise<boolean>} Whether the prompt was shown on this load
 */
function loadCachePage(html, timeoutMs) {
  document.body.innerHTML = html;
  let contentScript;
  jest.isolateModules(() => {
    contentScript = require('../../content_script');
  });
  return contentScript.initRatingPrompt(timeoutMs);
}

const withFriendLog = () => renderedLogsTable(['gcfl-friends-log']);
const prompt = () => document.querySelector('.gcfl-table tbody.gcfl-rating');

describe('rating prompt on the cache page', () => {
  const originalNavigator = global.navigator;

  beforeEach(async () => {
    await chrome.storage.local.clear();
    chrome.i18n.getMessage.mockImplementation(key => `msg:${key}`);
    chrome.runtime.getURL.mockImplementation(file => `chrome-extension://test/${file}`);
    delete global.browser;
    setUserAgent(CHROME_UA);
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
    delete global.browser;
    jest.useRealTimers();
  });

  describe('when it shows', () => {
    test('shows on the 5th counted use only, not on the 1st to 4th or the 6th', async () => {
      const shownOn = [];
      for (let use = 1; use <= 6; use++) {
        if (await loadCachePage(withFriendLog())) {
          shownOn.push(use);
        }
        expect(Boolean(prompt())).toBe(use === 5);
      }
      expect(shownOn).toEqual([5]);
    });

    test('my own log rows count as a use too', async () => {
      for (let use = 1; use <= 4; use++) {
        await loadCachePage(renderedLogsTable(['gcfl-my-log']));
      }
      expect(await loadCachePage(renderedLogsTable(['gcfl-my-log']))).toBe(true);
    });

    test('counts a page load once, however many log rows it shows', async () => {
      await loadCachePage(
        renderedLogsTable(['gcfl-friends-log', 'gcfl-friends-log', 'gcfl-my-log'])
      );
      expect((await stored()).ratingPromptUses).toBe(1);
    });

    test('calling it again on the same page load does not count again', async () => {
      document.body.innerHTML = withFriendLog();
      let contentScript;
      jest.isolateModules(() => {
        contentScript = require('../../content_script');
      });
      await contentScript.initRatingPrompt();
      await contentScript.initRatingPrompt();
      expect((await stored()).ratingPromptUses).toBe(1);
    });

    test('a page where no friend or own log row was shown does not count', async () => {
      for (let use = 1; use <= 4; use++) {
        await loadCachePage(withFriendLog());
      }
      expect(await loadCachePage(renderedLogsTable([]))).toBe(false);
      expect((await stored()).ratingPromptUses).toBe(4);
      expect(await loadCachePage(withFriendLog())).toBe(true);
    });

    test('a page where the extension rendered nothing does not count', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick'] });
      const load = loadCachePage('<table class="LogsTable" id="cache_logs_table"></table>');
      jest.advanceTimersByTime(60 * 1000);
      expect(await load).toBe(false);
      expect((await stored()).ratingPromptUses).toBeUndefined();
    });

    test('waits for the extension to finish rendering the logs', async () => {
      await chrome.storage.local.set({ ratingPromptUses: 4 });
      document.body.innerHTML = '<table class="LogsTable" id="cache_logs_table"></table>';
      let contentScript;
      jest.isolateModules(() => {
        contentScript = require('../../content_script');
      });
      const load = contentScript.initRatingPrompt();
      document.body.insertAdjacentHTML('afterbegin', withFriendLog());
      expect(await load).toBe(true);
      expect(prompt()).not.toBeNull();
    });

    test('keeps no data beyond the use count and the done flag', async () => {
      for (let use = 1; use <= 5; use++) {
        await loadCachePage(withFriendLog());
      }
      expect(Object.keys(await stored()).sort()).toEqual(['ratingPromptUses']);
    });
  });

  describe('where and what it shows', () => {
    beforeEach(async () => {
      await chrome.storage.local.set({ ratingPromptUses: 4 });
      await loadCachePage(withFriendLog());
    });

    test('sits under the friends logs, right above the Logbook header', () => {
      const tbody = prompt();
      expect(tbody.previousElementSibling.classList.contains('gcfl-rows')).toBe(true);
      expect(tbody.nextElementSibling.classList.contains('gcfl-logbook-header')).toBe(true);
    });

    test('reads its text and buttons through chrome.i18n', () => {
      expect(prompt().querySelector('.gcfl-rating-text').textContent).toBe('msg:ratingPromptText');
      expect(prompt().querySelector('.gcfl-rating-rate').textContent).toBe('msg:ratingPromptRate');
      expect(prompt().querySelector('.gcfl-rating-dismiss').textContent).toBe(
        'msg:ratingPromptDismiss'
      );
    });

    test('opens the store in a new tab', () => {
      const rate = prompt().querySelector('a.gcfl-rating-rate');
      expect(rate.getAttribute('target')).toBe('_blank');
      expect(rate.getAttribute('rel')).toBe('noopener noreferrer');
    });

    test('keeps a gap before the Logbook header', () => {
      expect(prompt().lastElementChild.classList.contains('gcfl-spacer')).toBe(true);
    });
  });

  describe('clicks', () => {
    beforeEach(async () => {
      await chrome.storage.local.set({ ratingPromptUses: 4 });
      await loadCachePage(withFriendLog());
    });

    test.each([
      ['Rate it', '.gcfl-rating-rate'],
      ['Not now', '.gcfl-rating-dismiss']
    ])('"%s" hides it, saves ratingPromptDone and it never renders again', async (_, button) => {
      prompt().querySelector(button).click();
      expect(prompt()).toBeNull();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect((await stored()).ratingPromptDone).toBe(true);

      // Even if the count were back at the threshold, a done prompt stays gone.
      await chrome.storage.local.set({ ratingPromptUses: 4 });
      for (let use = 1; use <= 3; use++) {
        expect(await loadCachePage(withFriendLog())).toBe(false);
        expect(prompt()).toBeNull();
      }
    });
  });

  describe('store link', () => {
    async function rateHref() {
      await chrome.storage.local.set({ ratingPromptUses: 4 });
      await loadCachePage(withFriendLog());
      return prompt().querySelector('a.gcfl-rating-rate').href;
    }

    const STORES = {
      chrome:
        'https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam',
      firefox: 'https://addons.mozilla.org/firefox/addon/geocaching-com-friends-logs/',
      edge: 'https://microsoftedge.microsoft.com/addons/detail/ddbfbobfccafkoabbcmpkbpofbkfgikc'
    };

    // Every browser here exposes `browser`, as recent Chromium versions do.
    test.each([
      ['Chrome', CHROME_UA, STORES.chrome],
      [
        'Edge',
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Edg/141.0',
        STORES.edge
      ],
      [
        'Opera',
        'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 OPR/125.0',
        STORES.chrome
      ],
      [
        'Firefox',
        'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
        STORES.firefox
      ]
    ])('on %s opens its store', async (_, userAgent, url) => {
      global.browser = { runtime: {} };
      setUserAgent(userAgent);
      expect(await rateHref()).toBe(url);
    });

    test('matches the popup footer rate link', async () => {
      setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/141.0 Edg/141.0');
      const { getStoreUrl } = require('../../init');
      expect(await rateHref()).toBe(getStoreUrl());
    });
  });

  describe('popup', () => {
    test('no longer carries a rating prompt', () => {
      const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');
      expect(html).not.toContain('rating-prompt');
    });
  });

  describe('locales', () => {
    const LOCALES_DIR = path.join(ROOT, '_locales');
    const read = locale =>
      JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
    const en = read('en');
    const locales = fs
      .readdirSync(LOCALES_DIR, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name);

    test('en has the exact text from #135', () => {
      expect(en.ratingPromptText.message).toBe(
        'Is Friends Logs useful to you? A quick rating on the store helps other geocachers find it.'
      );
      expect(en.ratingPromptRate.message).toBe('Rate it');
      expect(en.ratingPromptDismiss.message).toBe('Not now');
    });

    test('descriptions say the prompt is on cache pages', () => {
      for (const key of RATING_KEYS) {
        expect(en[key].description).toMatch(/cache page/);
        expect(en[key].description).not.toMatch(/popup/);
      }
    });

    test.each(locales)('%s has every rating prompt string', locale => {
      const messages = read(locale);
      for (const key of RATING_KEYS) {
        expect(typeof messages[key].message).toBe('string');
        expect(messages[key].message.trim()).not.toBe('');
        expect(messages[key].description).toBe(en[key].description);
      }
    });
  });
});
