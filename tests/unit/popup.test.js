const {
  DEFAULT_VALUES,
  STORE_URLS,
  detectBrowser,
  updateRateLink,
  displayVersion
} = require('../../popup');

describe('popup.js', () => {
  describe('DEFAULT_VALUES', () => {
    test('matches init.js defaults', () => {
      expect(DEFAULT_VALUES).toEqual({
        showFriendsLogs: true,
        showMyLogs: false,
        limit: 5
      });
    });
  });

  describe('STORE_URLS', () => {
    test('has URLs for all supported browsers', () => {
      expect(STORE_URLS).toHaveProperty('chrome');
      expect(STORE_URLS).toHaveProperty('firefox');
      expect(STORE_URLS).toHaveProperty('opera');
      expect(STORE_URLS).toHaveProperty('edge');
    });

    test('all URLs are valid https URLs', () => {
      for (const url of Object.values(STORE_URLS)) {
        expect(url).toMatch(/^https:\/\//);
      }
    });
  });

  describe('detectBrowser', () => {
    const originalNavigator = global.navigator;

    afterEach(() => {
      Object.defineProperty(global, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true
      });
      delete global.browser;
    });

    test('returns "firefox" when browser.runtime is defined', () => {
      global.browser = { runtime: {} };
      expect(detectBrowser()).toBe('firefox');
    });

    test('returns "edge" for Edge user agent', () => {
      delete global.browser;
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Edg/120.0'
        },
        writable: true,
        configurable: true
      });
      expect(detectBrowser()).toBe('edge');
    });

    test('returns "opera" for Opera user agent', () => {
      delete global.browser;
      Object.defineProperty(global, 'navigator', {
        value: {
          userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 OPR/106.0'
        },
        writable: true,
        configurable: true
      });
      expect(detectBrowser()).toBe('opera');
    });

    test('returns "chrome" as default', () => {
      delete global.browser;
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0' },
        writable: true,
        configurable: true
      });
      expect(detectBrowser()).toBe('chrome');
    });
  });

  describe('updateRateLink', () => {
    beforeEach(() => {
      document.body.innerHTML = '<a id="rate-link" href=""></a>';
      delete global.browser;
    });

    test('sets href to correct store URL', () => {
      Object.defineProperty(global, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 Chrome/120.0' },
        writable: true,
        configurable: true
      });

      updateRateLink();

      const link = document.getElementById('rate-link');
      expect(link.href).toBe(STORE_URLS.chrome);
    });
  });

  describe('displayVersion', () => {
    beforeEach(() => {
      document.body.innerHTML = '<span id="version"></span>';
      chrome.runtime.getManifest.mockReturnValue({ version: '2.3.2' });
    });

    test('displays version from manifest', () => {
      displayVersion();

      const el = document.getElementById('version');
      expect(el.textContent).toBe('v2.3.2');
    });
  });
});
