const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 1);

const popup = require('../../popup');
const { recordFirstUse } = require('../../content_script');

const RATING_KEYS = ['ratingPromptText', 'ratingPromptRate', 'ratingPromptDismiss'];

function loadPopupBody() {
  const html = fs.readFileSync(path.join(ROOT, 'popup.html'), 'utf8');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)[1];
}

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

const prompt = () => document.getElementById('rating-prompt');

describe('rating prompt', () => {
  const originalNavigator = global.navigator;

  beforeEach(async () => {
    await chrome.storage.local.clear();
    chrome.i18n.getMessage.mockImplementation(key => `msg:${key}`);
    delete global.browser;
    setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0');
    loadPopupBody();
  });

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true
    });
    delete global.browser;
  });

  describe('timing', () => {
    test('waits three weeks of use before showing', () => {
      expect(popup.RATING_PROMPT_DELAY_MS).toBe(21 * DAY_MS);
    });

    test('is hidden in the markup until the popup decides to show it', () => {
      expect(prompt().hidden).toBe(true);
    });

    test('first popup open starts the clock and does not show the prompt', async () => {
      await popup.initRatingPrompt(NOW);
      expect(prompt().hidden).toBe(true);
      expect((await stored()).firstUsedAt).toBe(NOW);
    });

    test('does not move an existing first-use date', async () => {
      await chrome.storage.local.set({ firstUsedAt: NOW - 5 * DAY_MS });
      await popup.initRatingPrompt(NOW);
      expect((await stored()).firstUsedAt).toBe(NOW - 5 * DAY_MS);
    });

    test('stays hidden before three weeks of use', async () => {
      await chrome.storage.local.set({ firstUsedAt: NOW - 21 * DAY_MS + 1 });
      await popup.initRatingPrompt(NOW);
      expect(prompt().hidden).toBe(true);
    });

    test('shows after three weeks of use', async () => {
      await chrome.storage.local.set({ firstUsedAt: NOW - 21 * DAY_MS });
      await popup.initRatingPrompt(NOW);
      expect(prompt().hidden).toBe(false);
    });

    test('a cache page visit records the first-use date once', async () => {
      await recordFirstUse(NOW - 30 * DAY_MS);
      await recordFirstUse(NOW);
      expect((await stored()).firstUsedAt).toBe(NOW - 30 * DAY_MS);
    });
  });

  describe('text', () => {
    test('reads its text and buttons through chrome.i18n', async () => {
      await chrome.storage.local.set({ firstUsedAt: NOW - 30 * DAY_MS });
      await popup.initRatingPrompt(NOW);
      expect(document.getElementById('rating-prompt-text').textContent).toBe(
        'msg:ratingPromptText'
      );
      expect(document.getElementById('rating-prompt-rate').textContent).toBe(
        'msg:ratingPromptRate'
      );
      expect(document.getElementById('rating-prompt-dismiss').textContent).toBe(
        'msg:ratingPromptDismiss'
      );
    });
  });

  describe('clicks', () => {
    beforeEach(async () => {
      await chrome.storage.local.set({ firstUsedAt: NOW - 30 * DAY_MS });
      await popup.initRatingPrompt(NOW);
    });

    test('"Rate it" hides the prompt and it never shows again', async () => {
      document.getElementById('rating-prompt-rate').click();
      expect(prompt().hidden).toBe(true);
      expect((await stored()).ratingPromptDone).toBe(true);

      loadPopupBody();
      await popup.initRatingPrompt(NOW + 365 * DAY_MS);
      expect(prompt().hidden).toBe(true);
    });

    test('"Not now" hides the prompt and it never shows again', async () => {
      document.getElementById('rating-prompt-dismiss').click();
      expect(prompt().hidden).toBe(true);
      expect((await stored()).ratingPromptDone).toBe(true);

      loadPopupBody();
      await popup.initRatingPrompt(NOW + 365 * DAY_MS);
      expect(prompt().hidden).toBe(true);
    });

    test('keeps showing on later opens until one of the buttons is clicked', async () => {
      loadPopupBody();
      await popup.initRatingPrompt(NOW + DAY_MS);
      expect(prompt().hidden).toBe(false);
    });
  });

  describe('store link', () => {
    async function rateHref() {
      await chrome.storage.local.set({ firstUsedAt: NOW - 30 * DAY_MS });
      await popup.initRatingPrompt(NOW);
      const link = document.getElementById('rating-prompt-rate');
      expect(link.getAttribute('target')).toBe('_blank');
      return link.href;
    }

    test('opens the Chrome Web Store on Chrome', async () => {
      expect(await rateHref()).toBe(popup.STORE_URLS.chrome);
    });

    test('opens Edge Add-ons on Edge', async () => {
      setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Edg/120.0');
      expect(await rateHref()).toBe(popup.STORE_URLS.edge);
    });

    test('opens Firefox Add-ons on Firefox', async () => {
      global.browser = { runtime: {} };
      setUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0');
      expect(await rateHref()).toBe(popup.STORE_URLS.firefox);
    });

    test('opens the Chrome Web Store on Chrome that exposes the browser namespace', async () => {
      global.browser = { runtime: {} };
      expect(await rateHref()).toBe(popup.STORE_URLS.chrome);
    });

    test('matches the footer rate link', async () => {
      setUserAgent('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Edg/120.0');
      popup.updateRateLink();
      expect(await rateHref()).toBe(document.getElementById('rate-link').href);
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

    test('ships a pt_PT locale', () => {
      expect(locales).toContain('pt_PT');
    });

    test.each(locales)('%s has every rating prompt string', locale => {
      const messages = read(locale);
      for (const key of RATING_KEYS) {
        expect(typeof messages[key].message).toBe('string');
        expect(messages[key].message.trim()).not.toBe('');
        expect(messages[key].description).toBe(en[key].description);
      }
    });

    test.each(locales)('%s has the same keys as en', locale => {
      expect(Object.keys(read(locale)).sort()).toEqual(Object.keys(en).sort());
    });

    test.each(['scripts/build.js', 'scripts/zip.js', 'scripts/build-multi.js'])(
      '%s packages pt_PT',
      script => {
        const source = fs.readFileSync(path.join(ROOT, script), 'utf8');
        expect(source).toContain("'_locales/pt_PT/messages.json'");
      }
    );
  });
});
