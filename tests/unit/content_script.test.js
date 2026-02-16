const { injectScript, doInject } = require('../../content_script');

describe('content_script.js', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    chrome.storage.local.get.mockClear();
    chrome.runtime.getURL.mockClear();
    chrome.runtime.lastError = undefined;
    // Override the mock to NOT auto-invoke callback
    chrome.storage.local.get.mockImplementation((_keys, _cb) => {});
  });

  describe('injectScript', () => {
    test('creates a script element with correct attributes', () => {
      injectScript('inject.js', 'body', 'false', 'true', '5');

      const script = document.getElementById('inject');
      expect(script).not.toBeNull();
      expect(script.tagName).toBe('SCRIPT');
      expect(script.getAttribute('type')).toBe('text/javascript');
      expect(script.getAttribute('showMyLogs')).toBe('false');
      expect(script.getAttribute('showFriendsLogs')).toBe('true');
      expect(script.getAttribute('limit')).toBe('5');
    });

    test('appends cache-busting timestamp to src', () => {
      injectScript('inject.js', 'body', 'false', 'true', '5');

      const script = document.getElementById('inject');
      expect(script.getAttribute('src')).toMatch(/^inject\.js\?t=\d+$/);
    });

    test('does nothing if target node is not found', () => {
      injectScript('inject.js', 'header', 'false', 'true', '5');

      const script = document.getElementById('inject');
      expect(script).toBeNull();
    });
  });

  describe('doInject', () => {
    test('skips injection when inject element already exists', () => {
      const existing = document.createElement('div');
      existing.id = 'inject';
      document.body.appendChild(existing);

      doInject();
      expect(chrome.storage.local.get).not.toHaveBeenCalled();
    });

    test('reads settings from storage', () => {
      doInject();
      expect(chrome.storage.local.get).toHaveBeenCalledWith(
        global.DEFAULT_VALUES,
        expect.any(Function)
      );
    });

    test('injects script when showFriendsLogs is true', () => {
      chrome.runtime.getURL.mockReturnValue('chrome-extension://test/inject.js');

      doInject();

      const callback = chrome.storage.local.get.mock.calls[0][1];
      callback({ showFriendsLogs: true, showMyLogs: false, limit: 5 });

      const script = document.getElementById('inject');
      expect(script).not.toBeNull();
      expect(script.getAttribute('showFriendsLogs')).toBe('true');
    });

    test('does not inject when both log options are disabled', () => {
      doInject();

      const callback = chrome.storage.local.get.mock.calls[0][1];
      callback({ showFriendsLogs: false, showMyLogs: false, limit: 5 });

      const script = document.getElementById('inject');
      expect(script).toBeNull();
    });

    test('falls back to defaults on storage error', () => {
      chrome.runtime.lastError = { message: 'test error' };
      chrome.runtime.getURL.mockReturnValue('chrome-extension://test/inject.js');

      doInject();

      const callback = chrome.storage.local.get.mock.calls[0][1];
      // Even on error, the callback receives items (the mock passes keys through)
      // The code replaces items with DEFAULT_VALUES on lastError
      callback({});

      const script = document.getElementById('inject');
      expect(script).not.toBeNull();

      chrome.runtime.lastError = undefined;
    });
  });

  describe('bfcache handler', () => {
    test('re-injects on pageshow with persisted=true', () => {
      chrome.runtime.getURL.mockReturnValue('chrome-extension://test/inject.js');

      // First injection
      doInject();
      const cb1 = chrome.storage.local.get.mock.calls[0][1];
      cb1({ showFriendsLogs: true, showMyLogs: false, limit: 5 });
      expect(document.getElementById('inject')).not.toBeNull();

      // Simulate bfcache restore
      const event = new Event('pageshow');
      Object.defineProperty(event, 'persisted', { value: true });
      window.dispatchEvent(event);

      // Storage should be read again (the old element was removed and re-injection requested)
      expect(chrome.storage.local.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
