const { loadLogbookPage, waitForGlobalsAndLoad } = require('../../inject');

/**
 * Creates a minimal jQuery-like mock object for DOM manipulation.
 */
function createJQueryResult(overrides = {}) {
  const result = [];
  result.length = 0;
  result.insertBefore = jest.fn();
  result.addClass = jest.fn(() => result);
  result.find = jest.fn(() => ({
    remove: jest.fn(),
    each: jest.fn()
  }));
  Object.assign(result, overrides);
  return result;
}

describe('inject.js', () => {
  let mockGetJSON;
  let mockDoneCallback;
  let mockFailCallback;

  beforeEach(() => {
    mockDoneCallback = null;
    mockFailCallback = null;

    const chainable = {
      done: jest.fn(function (cb) {
        mockDoneCallback = cb;
        return this;
      }),
      fail: jest.fn(function (cb) {
        mockFailCallback = cb;
        return this;
      })
    };

    mockGetJSON = jest.fn(() => chainable);

    // jQuery mock that handles both HTML strings and CSS selectors
    global.$ = Object.assign(
      jest.fn(_selector => createJQueryResult()),
      {
        getJSON: mockGetJSON,
        tmpl: jest.fn((_template, data) => {
          const result = createJQueryResult();
          result.length = data.length;
          return result;
        }),
        fn: {}
      }
    );

    global.userToken = 'test-token-123';
    global.decryptLogs = false;

    // Set up DOM
    document.body.innerHTML = `
      <div id="cache_logs_container">
        <div>
          <div>
            <div>inner content</div>
          </div>
        </div>
      </div>
      <table id="cache_logs_table">
        <tbody id="first-tbody"></tbody>
        <tbody class="main_tbody"></tbody>
      </table>
    `;
  });

  afterEach(() => {
    delete global.$;
    delete global.userToken;
    delete global.decryptLogs;
    jest.restoreAllMocks();
  });

  describe('loadLogbookPage', () => {
    test('calls API with correct parameters', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      expect(mockGetJSON).toHaveBeenCalledWith('/seek/geocache.logbook', {
        tkn: 'test-token-123',
        idx: 1,
        num: 5,
        sp: 'false',
        sf: 'true',
        decrypt: false
      });
    });

    test('loads friends first when both are requested', () => {
      loadLogbookPage(0, 'true', 'true', 5);

      expect(mockGetJSON).toHaveBeenCalledWith(
        '/seek/geocache.logbook',
        expect.objectContaining({
          sp: 'false',
          sf: 'true'
        })
      );
    });

    test('does nothing when userToken is missing', () => {
      delete global.userToken;
      loadLogbookPage(0, 'false', 'true', 5);
      expect(mockGetJSON).not.toHaveBeenCalled();
    });

    test('does nothing when jQuery is missing', () => {
      delete global.$;
      loadLogbookPage(0, 'false', 'true', 5);
      expect(mockGetJSON).not.toHaveBeenCalled();
    });

    test('renders logs via $.tmpl on success', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      mockDoneCallback({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [{ logID: 1 }, { logID: 2 }]
      });

      expect(global.$.tmpl).toHaveBeenCalledWith('tmplCacheLogRow', [{ logID: 1 }, { logID: 2 }]);
    });

    test('creates correct header text for single friend log', () => {
      const jqueryCalls = [];
      global.$ = Object.assign(
        jest.fn(arg => {
          jqueryCalls.push(arg);
          return createJQueryResult();
        }),
        {
          getJSON: mockGetJSON,
          tmpl: jest.fn(() => createJQueryResult()),
          fn: {}
        }
      );

      loadLogbookPage(0, 'false', 'true', 5);

      mockDoneCallback({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 1 }]
      });

      const headerCall = jqueryCalls.find(c => typeof c === 'string' && c.includes('Friend Log'));
      expect(headerCall).toContain('1 Friend Log');
      expect(headerCall).not.toContain('Friends Logs');
    });

    test('creates correct header text for multiple friend logs', () => {
      const jqueryCalls = [];
      global.$ = Object.assign(
        jest.fn(arg => {
          jqueryCalls.push(arg);
          return createJQueryResult();
        }),
        {
          getJSON: mockGetJSON,
          tmpl: jest.fn(() => createJQueryResult()),
          fn: {}
        }
      );

      loadLogbookPage(0, 'false', 'true', 5);

      mockDoneCallback({
        status: 'success',
        pageInfo: { rows: 3 },
        data: [{ logID: 1 }, { logID: 2 }, { logID: 3 }]
      });

      const headerCall = jqueryCalls.find(c => typeof c === 'string' && c.includes('Friends Logs'));
      expect(headerCall).toContain('3 Friends Logs');
    });

    test('handles non-success API status', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      loadLogbookPage(0, 'false', 'true', 5);
      mockDoneCallback({ status: 'error', pageInfo: { rows: 0 }, data: [] });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-success'), 'error');
      consoleSpy.mockRestore();
    });

    test('handles API failure', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      loadLogbookPage(0, 'false', 'true', 5);
      mockFailCallback({}, 'timeout', 'Request timed out');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API request failed'),
        'timeout',
        'Request timed out'
      );
      consoleSpy.mockRestore();
    });

    test('returns early when rows=0 and no personal logs pending', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      mockDoneCallback({
        status: 'success',
        pageInfo: { rows: 0 },
        data: []
      });

      expect(global.$.tmpl).not.toHaveBeenCalled();
    });
  });

  describe('waitForGlobalsAndLoad', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test('calls loadLogbookPage immediately when globals exist', () => {
      waitForGlobalsAndLoad(10, 'false', 'true', 5);
      expect(mockGetJSON).toHaveBeenCalled();
    });

    test('retries when globals are not available', () => {
      delete global.userToken;

      waitForGlobalsAndLoad(3, 'false', 'true', 5);
      expect(mockGetJSON).not.toHaveBeenCalled();

      // Make globals available
      global.userToken = 'test-token';

      jest.advanceTimersByTime(500);
      expect(mockGetJSON).toHaveBeenCalled();
    });

    test('gives up after retries exhausted', () => {
      delete global.userToken;
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      waitForGlobalsAndLoad(1, 'false', 'true', 5);
      jest.advanceTimersByTime(500);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('not available after retries')
      );
      consoleSpy.mockRestore();
    });
  });
});
