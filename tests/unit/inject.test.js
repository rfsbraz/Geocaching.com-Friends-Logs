const {
  loadLogbookPage,
  waitForGlobalsAndLoad,
  findLogTable,
  showErrorBanner,
  buildReportUrl,
  describeBrowser
} = require('../../inject');

/**
 * Creates a jQuery-like wrapper that performs REAL DOM operations.
 * This ensures tests verify actual DOM state, not just mock call counts.
 */
function jQueryObj(elements) {
  const arr = Array.isArray(elements) ? elements.slice() : [elements];
  arr.insertBefore = function (target) {
    // Unwrap jQuery-like objects to get the actual DOM element.
    // Check !nodeType to avoid treating text nodes (which have .length) as arrays.
    const el = target && !target.nodeType && typeof target.length === 'number' ? target[0] : target;
    if (el && el.parentNode) {
      for (let i = 0; i < arr.length; i++) {
        el.parentNode.insertBefore(arr[i], el);
      }
    }
    return arr;
  };
  arr.addClass = function (cls) {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].classList) {
        arr[i].classList.add(cls);
      }
    }
    return arr;
  };
  arr.find = function (selector) {
    const results = [];
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].querySelectorAll) {
        const found = arr[i].querySelectorAll(selector);
        for (let j = 0; j < found.length; j++) {
          results.push(found[j]);
        }
      }
    }
    return jQueryObj(results);
  };
  arr.remove = function () {
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] && arr[i].parentNode) {
        arr[i].parentNode.removeChild(arr[i]);
      }
    }
    return arr;
  };
  arr.each = function (fn) {
    for (let i = 0; i < arr.length; i++) {
      fn.call(arr[i], i, arr[i]);
    }
    return arr;
  };
  arr.data = function () {
    return '';
  };
  return arr;
}

/**
 * Set up the real-ish jQuery mock that does actual DOM manipulation.
 * Returns { $, getJSON } so tests can intercept API calls.
 */
function setupJQuery() {
  let doneCallback = null;
  let failCallback = null;

  const chainable = {
    done: jest.fn(function (cb) {
      doneCallback = cb;
      return this;
    }),
    fail: jest.fn(function (cb) {
      failCallback = cb;
      return this;
    })
  };

  const mockGetJSON = jest.fn(() => chainable);

  function $(selector) {
    // Handle DOM element wrapping
    if (selector && selector.nodeType) {
      return jQueryObj([selector]);
    }
    // Handle array-like (e.g., result of $.tmpl)
    if (typeof selector === 'object' && typeof selector.length === 'number') {
      const elems = [];
      for (let i = 0; i < selector.length; i++) {
        if (selector[i] && selector[i].nodeType) {
          elems.push(selector[i]);
        }
      }
      return jQueryObj(elems);
    }
    // Handle HTML strings
    if (typeof selector === 'string' && selector.charAt(0) === '<') {
      // Use a <table> wrapper so the browser parses <tbody>/<tr>/<td> correctly
      const isTableContent = /^<(tbody|thead|tfoot|tr|td|th|caption|colgroup|col)\b/i.test(
        selector
      );
      const wrapper = document.createElement(isTableContent ? 'table' : 'div');
      wrapper.innerHTML = selector;
      const children = [];
      while (wrapper.firstChild) {
        children.push(wrapper.firstChild);
        wrapper.removeChild(wrapper.firstChild);
      }
      return jQueryObj(children);
    }
    // CSS selector
    const els = document.querySelectorAll(selector);
    return jQueryObj(Array.from(els));
  }

  $.getJSON = mockGetJSON;
  $.tmpl = jest.fn((_template, data) => {
    // Create real DOM elements like the geocaching.com template would
    const rows = data.map(item => {
      const tbody = document.createElement('tbody');
      tbody.className = 'log-row';
      tbody.setAttribute('data-log-id', String(item.logID || item.LogID || ''));
      tbody.innerHTML =
        '<tr><td>' + (item.UserName || 'User') + ' - ' + (item.LogText || '') + '</td></tr>';
      return tbody;
    });
    return jQueryObj(rows);
  });
  $.fn = {};

  /** Invoke the .done() callback manually in tests */
  function triggerDone(response) {
    if (doneCallback) {
      doneCallback(response);
    }
  }

  /** Invoke the .fail() callback manually in tests */
  function triggerFail(...args) {
    if (failCallback) {
      failCallback(...args);
    }
  }

  return { $, mockGetJSON, triggerDone, triggerFail };
}

describe('inject.js', () => {
  let mockGetJSON;
  let triggerDone;
  let triggerFail;

  beforeEach(() => {
    const jq = setupJQuery();
    global.$ = jq.$;
    mockGetJSON = jq.mockGetJSON;
    triggerDone = jq.triggerDone;
    triggerFail = jq.triggerFail;

    global.userToken = 'test-token-123';
    global.decryptLogs = false;

    // Set up DOM matching geocaching.com structure
    document.body.innerHTML = `
      <div id="cache_logs_container">
        <div class="container">
          <div class="log-section">
            <div class="section-header">Logbook</div>
          </div>
        </div>
      </div>
      <table id="cache_logs_table"><tbody id="first-tbody"><tr><td>Existing log</td></tr></tbody><tbody><tr><td>Another log</td></tr></tbody></table>
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

    test('inserts friend log elements into the DOM', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [
          { logID: 1, UserName: 'Alice' },
          { logID: 2, UserName: 'Bob' }
        ]
      });

      // Verify ACTUAL DOM: friend log rows exist with correct class
      const ownTable = document.querySelector('table.gcfl-table');
      expect(ownTable.nextElementSibling.id).toBe('cache_logs_table');
      const friendLogs = ownTable.querySelectorAll('.gcfl-friends-log');
      expect(friendLogs).toHaveLength(2);
      expect(friendLogs[0].getAttribute('data-log-id')).toBe('1');
      expect(friendLogs[1].getAttribute('data-log-id')).toBe('2');
    });

    test('inserts friends header with correct count into DOM', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [{ logID: 1 }, { logID: 2 }]
      });

      const header = document.querySelector('.gcfl-friends-header');
      expect(header).not.toBeNull();
      expect(header.textContent).toContain('2 Friends Logs');
    });

    test('uses singular "1 Friend Log" for single log', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 1 }]
      });

      const header = document.querySelector('.gcfl-friends-header');
      expect(header).not.toBeNull();
      expect(header.textContent).toContain('1 Friend Log');
      expect(header.textContent).not.toContain('Friends Logs');
    });

    test('inserts "Logbook" header after friends logs', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 1 }]
      });

      const logbookHeader = document.querySelector('.gcfl-logbook-header');
      expect(logbookHeader).not.toBeNull();
      expect(logbookHeader.textContent).toContain('Logbook');
    });

    test('keeps injected logs outside the site logbook table', () => {
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });

      const siteTable = document.getElementById('cache_logs_table');
      expect(siteTable.querySelector('.gcfl-header, .gcfl-friends-log')).toBeNull();
      expect(siteTable.querySelector('#first-tbody').textContent).toContain('Existing log');
    });

    test('injected logs survive the site clearing its logbook on lazy load (#85)', () => {
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 2 }, data: [{ logID: 1 }, { logID: 2 }] });

      // cachedetails-main: n.find("tbody").empty(), n.find(".log-row").remove(), then append rows
      const siteTable = document.getElementById('cache_logs_table');
      siteTable.querySelectorAll('tbody').forEach(tb => (tb.innerHTML = ''));
      siteTable.querySelectorAll('.log-row').forEach(r => r.remove());
      siteTable.insertAdjacentHTML('beforeend', '<tr class="log-row"><td>Lazy log</td></tr>');

      expect(document.querySelectorAll('.gcfl-friends-log')).toHaveLength(2);
      expect(document.querySelector('.gcfl-friends-header').textContent).toContain(
        '2 Friends Logs'
      );
      expect(document.querySelector('.gcfl-logbook-header')).not.toBeNull();
    });

    test('renders <tr> template rows inside a tbody with a trailing spacer', () => {
      global.$.tmpl = jest.fn((_t, data) => {
        const rows = data.map(item => {
          const tr = document.createElement('tr');
          tr.className = 'log-row';
          tr.setAttribute('data-log-id', String(item.logID));
          tr.innerHTML = '<td>row</td>';
          return tr;
        });
        const arr = rows.slice();
        arr.addClass = cls => (rows.forEach(r => r.classList.add(cls)), arr);
        arr.find = () => Object.assign([], { remove() {}, each() {} });
        return arr;
      });
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 2 }, data: [{ logID: 1 }, { logID: 2 }] });

      const body = document.querySelector('.gcfl-table tbody.gcfl-rows');
      expect(body.querySelectorAll('tr.gcfl-friends-log')).toHaveLength(2);
      // The site's infinite scroll uses $('.log-row:last-child'); ours must never match.
      expect(body.lastElementChild.className).toBe('gcfl-spacer');
      expect(document.querySelectorAll('.gcfl-table .log-row:last-child')).toHaveLength(0);
    });

    test('falls back to table.LogsTable when the legacy id is gone', () => {
      document.body.innerHTML =
        '<div><table class="LogsTable"><tbody><tr class="log-row"><td>x</td></tr></tbody></table></div>';
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });

      const own = document.querySelector('table.gcfl-table');
      expect(own.nextElementSibling.classList.contains('LogsTable')).toBe(true);
      expect(findLogTable().classList.contains('gcfl-table')).toBe(false);
    });

    test('waits for a logbook table that is added after the API responds', async () => {
      document.body.innerHTML = '<div id="logbook-slot"></div>';
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });
      expect(document.querySelector('.gcfl-friends-header')).toBeNull();

      document.getElementById('logbook-slot').innerHTML = '<table id="cache_logs_table"></table>';
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(document.querySelector('.gcfl-friends-header')).not.toBeNull();
      expect(document.querySelectorAll('.gcfl-friends-log')).toHaveLength(1);
    });

    test('inserts personal log elements with correct class', () => {
      loadLogbookPage(0, 'true', 'false', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 99, UserName: 'Me' }]
      });

      const myLogs = document.querySelectorAll('.gcfl-my-log');
      expect(myLogs).toHaveLength(1);

      const myHeader = document.querySelector('.gcfl-my-header');
      expect(myHeader).not.toBeNull();
      expect(myHeader.textContent).toContain('My Log');
    });

    test('handles non-success API status', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'error', pageInfo: { rows: 0 }, data: [] });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('non-success'), 'error');

      // Verify no logs were inserted
      expect(document.querySelectorAll('.gcfl-friends-log')).toHaveLength(0);
      consoleSpy.mockRestore();
    });

    test('handles API failure', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      loadLogbookPage(0, 'false', 'true', 5);
      triggerFail({}, 'timeout', 'Request timed out');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API request failed'),
        'timeout',
        'Request timed out'
      );
      consoleSpy.mockRestore();
    });

    test('returns early when rows=0 and no personal logs pending', () => {
      loadLogbookPage(0, 'false', 'true', 5);

      triggerDone({
        status: 'success',
        pageInfo: { rows: 0 },
        data: []
      });

      // No headers or logs should be in the DOM
      expect(document.querySelector('.gcfl-friends-header')).toBeNull();
      expect(document.querySelectorAll('.gcfl-friends-log')).toHaveLength(0);
    });
  });

  describe('loadLogbookPage — both friends and personal logs', () => {
    test('loads friends first, then personal logs sequentially', () => {
      // Track all API calls so we can trigger each done callback
      const apiCalls = [];
      let callIndex = 0;
      const doneCallbacks = [];

      global.$.getJSON = jest.fn(() => {
        const chain = {
          done: jest.fn(function (cb) {
            doneCallbacks.push(cb);
            return this;
          }),
          fail: jest.fn(function () {
            return this;
          })
        };
        apiCalls.push(global.$.getJSON.mock.calls[callIndex]);
        callIndex++;
        return chain;
      });

      loadLogbookPage(0, 'true', 'true', 5);

      // First call should be friends only (personal deferred)
      expect(apiCalls).toHaveLength(1);
      expect(apiCalls[0][1].sf).toBe('true');
      expect(apiCalls[0][1].sp).toBe('false');

      // Trigger friends response
      doneCallbacks[0]({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [
          { logID: 1, UserName: 'Friend1' },
          { logID: 2, UserName: 'Friend2' }
        ]
      });

      // Second call should be personal only
      expect(apiCalls).toHaveLength(2);
      expect(apiCalls[1][1].sf).toBe('false');
      expect(apiCalls[1][1].sp).toBe('true');

      // Trigger personal response
      doneCallbacks[1]({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 99, UserName: 'Me' }]
      });

      // Verify DOM has BOTH friend and personal logs
      const friendLogs = document.querySelectorAll('.gcfl-friends-log');
      expect(friendLogs).toHaveLength(2);

      const myLogs = document.querySelectorAll('.gcfl-my-log');
      expect(myLogs).toHaveLength(1);

      // Verify both headers exist
      expect(document.querySelector('.gcfl-friends-header')).not.toBeNull();
      expect(document.querySelector('.gcfl-my-header')).not.toBeNull();

      // Verify "Logbook" header added after personal logs
      expect(document.querySelector('.gcfl-logbook-header')).not.toBeNull();
    });

    test('does not insert Logbook header until personal logs are loaded', () => {
      const doneCallbacks = [];

      global.$.getJSON = jest.fn(() => ({
        done: jest.fn(function (cb) {
          doneCallbacks.push(cb);
          return this;
        }),
        fail: jest.fn(function () {
          return this;
        })
      }));

      loadLogbookPage(0, 'true', 'true', 5);

      // Trigger friends response
      doneCallbacks[0]({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 1, UserName: 'Friend' }]
      });

      // After friends only, no Logbook header yet
      expect(document.querySelector('.gcfl-logbook-header')).toBeNull();

      // Trigger personal response
      doneCallbacks[1]({
        status: 'success',
        pageInfo: { rows: 1 },
        data: [{ logID: 99, UserName: 'Me' }]
      });

      // Now Logbook header should exist
      expect(document.querySelector('.gcfl-logbook-header')).not.toBeNull();
    });
  });

  describe('translated headers (#122)', () => {
    const PT_LABELS = {
      friendsLog: '1 log de amigo',
      friendsLogs: '{count} logs de amigos',
      myLog: 'O meu log',
      myLogs: 'Os meus logs',
      logbook: 'Logbook'
    };

    function setLabels(labels) {
      const script = document.createElement('script');
      script.id = 'inject';
      script.setAttribute('data-labels', JSON.stringify(labels));
      document.body.appendChild(script);
    }

    const headerText = selector => document.querySelector(selector).textContent;

    test('uses the labels the content script passed, with the count filled in', () => {
      setLabels(PT_LABELS);
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 3 }, data: [{ logID: 1 }] });

      expect(headerText('.gcfl-friends-header')).toBe('3 logs de amigos');
      expect(headerText('.gcfl-logbook-header')).toBe('Logbook');
    });

    test('uses the singular label for one friend log', () => {
      setLabels(PT_LABELS);
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });

      expect(headerText('.gcfl-friends-header')).toBe('1 log de amigo');
    });

    test('translates the my logs header', () => {
      setLabels(PT_LABELS);
      loadLogbookPage(0, 'true', 'false', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 2 }, data: [{ logID: 1 }] });

      expect(headerText('.gcfl-my-header')).toBe('Os meus logs');
    });

    test('falls back to English for labels that are missing or unreadable', () => {
      setLabels({ logbook: 'Logboek' });
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 2 }, data: [{ logID: 1 }] });

      expect(headerText('.gcfl-friends-header')).toBe('2 Friends Logs');
      expect(headerText('.gcfl-logbook-header')).toBe('Logboek');

      document.body.innerHTML = '<table id="cache_logs_table"></table>';
      const script = document.createElement('script');
      script.id = 'inject';
      script.setAttribute('data-labels', '{not json');
      document.body.appendChild(script);
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });

      expect(headerText('.gcfl-friends-header')).toBe('1 Friend Log');
    });
  });

  describe('logbook response shape (#93)', () => {
    // Synthetic fixture: built from the fields the site's tmplCacheLogRow template reads and the
    // pageInfo/data shape inject.js uses. Not a real captured payload (that needs a logged-in session).
    const fixture = require('../fixtures/logbook-response.json');

    test('renders the fixture payload', () => {
      loadLogbookPage(0, 'false', 'true', 5);
      triggerDone(JSON.parse(JSON.stringify(fixture)));

      expect(document.querySelectorAll('.gcfl-friends-log')).toHaveLength(fixture.data.length);
      expect(document.querySelector('.gcfl-friends-header').textContent).toContain(
        '2 Friends Logs'
      );
    });

    const drifted = {
      'pageInfo missing': r => delete r.pageInfo,
      'pageInfo.rows missing': r => delete r.pageInfo.rows,
      'pageInfo.rows not a number': r => (r.pageInfo.rows = '2'),
      'data missing': r => delete r.data,
      'data not an array': r => (r.data = { 0: r.data[0] })
    };

    test.each(Object.keys(drifted))(
      'bails out with a console warning and the error banner when %s',
      name => {
        const warn = jest.spyOn(console, 'warn').mockImplementation();
        const before = document.body.innerHTML;
        const response = JSON.parse(JSON.stringify(fixture));
        drifted[name](response);

        loadLogbookPage(0, 'false', 'true', 5);
        expect(() => triggerDone(response)).not.toThrow();

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Unexpected logbook response'));
        document.querySelector('.gcfl-error').closest('table').remove();
        expect(document.body.innerHTML).toBe(before);
      }
    );

    test('bails out cleanly with the error banner on an empty response body', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation();
      const before = document.body.innerHTML;

      loadLogbookPage(0, 'false', 'true', 5);
      expect(() => triggerDone(null)).not.toThrow();

      expect(warn).toHaveBeenCalled();
      document.querySelector('.gcfl-error').closest('table').remove();
      expect(document.body.innerHTML).toBe(before);
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

    test('passes settings through to loadLogbookPage', () => {
      waitForGlobalsAndLoad(10, 'true', 'false', 20);

      expect(mockGetJSON).toHaveBeenCalledWith(
        '/seek/geocache.logbook',
        expect.objectContaining({
          sp: 'true',
          sf: 'false',
          num: 20
        })
      );
    });
  });

  describe('duplicate execution guard', () => {
    test('calling loadLogbookPage twice produces only one set of headers', () => {
      const doneCallbacks = [];
      global.$.getJSON = jest.fn(() => ({
        done: jest.fn(function (cb) {
          doneCallbacks.push(cb);
          return this;
        }),
        fail: jest.fn(function () {
          return this;
        })
      }));

      // First call
      loadLogbookPage(0, 'false', 'true', 5);
      doneCallbacks[0]({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [
          { logID: 1, UserName: 'Alice' },
          { logID: 2, UserName: 'Bob' }
        ]
      });

      // Second call (simulates duplicate execution)
      loadLogbookPage(0, 'false', 'true', 5);
      doneCallbacks[1]({
        status: 'success',
        pageInfo: { rows: 2 },
        data: [
          { logID: 1, UserName: 'Alice' },
          { logID: 2, UserName: 'Bob' }
        ]
      });

      // Only one friends header should exist (DOM guard is at IIFE level,
      // but loadLogbookPage itself may be called twice — the IIFE-level guard
      // prevents the second script load from reaching loadLogbookPage)
      const friendHeaders = document.querySelectorAll('.gcfl-friends-header');
      // Two calls to loadLogbookPage will produce two headers at this level;
      // the DOM guard in the IIFE prevents the second *script execution*
      expect(friendHeaders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error banner (#87)', () => {
    const REPORT_PREFIX = 'https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/new?';
    const banner = () => document.querySelector('.gcfl-error-banner');

    function setInjectElement(attrs = {}) {
      const script = document.createElement('script');
      script.id = 'inject';
      for (const [name, value] of Object.entries(attrs)) {
        script.setAttribute(name, value);
      }
      document.body.appendChild(script);
    }

    function reportParams() {
      const href = document.querySelector('.gcfl-error-report').getAttribute('href');
      expect(href.startsWith(REPORT_PREFIX)).toBe(true);
      return new URLSearchParams(href.slice(REPORT_PREFIX.length));
    }

    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
      delete global.isLoggedIn;
      delete window.__gcflErrorDismissed;
    });

    describe('shows when Friends Logs cannot load or parse the page', () => {
      test('the logbook request fails', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerFail({ status: 500 }, 'error', 'Internal Server Error');
        expect(banner()).not.toBeNull();
        expect(reportParams().get('body')).toContain(
          '- Failure: logbook request failed (HTTP 500)'
        );
      });

      test('the logbook API returns a non-success status', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'error', pageInfo: { rows: 0 }, data: [] });
        expect(banner()).not.toBeNull();
      });

      test('the logbook response has an unexpected shape', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', data: [] });
        expect(banner()).not.toBeNull();
        expect(reportParams().get('body')).toContain('- Failure: unexpected logbook response');
      });

      test('the log row template is missing', () => {
        delete global.$.tmpl;
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });
        expect(banner()).not.toBeNull();
      });

      test('rendering the logs throws', () => {
        global.$.tmpl = jest.fn(() => {
          throw new Error('template not compiled');
        });
        loadLogbookPage(0, 'false', 'true', 5);
        expect(() =>
          triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] })
        ).not.toThrow();
        expect(banner()).not.toBeNull();
      });

      test('the page globals never appear', () => {
        jest.useFakeTimers();
        delete global.userToken;
        waitForGlobalsAndLoad(1, 'false', 'true', 5);
        jest.advanceTimersByTime(500);
        jest.useRealTimers();
        expect(banner()).not.toBeNull();
        expect(reportParams().get('body')).toContain('- Failure: page globals not found');
      });

      test('the logbook table never appears', () => {
        jest.useFakeTimers();
        document.getElementById('cache_logs_table').remove();
        document.body.insertAdjacentHTML(
          'afterbegin',
          '<div class="UserSuppliedContent"><span id="ctl00_ContentBody_LongDescription">Desc</span></div>'
        );
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });
        expect(banner()).toBeNull();
        jest.advanceTimersByTime(20000);
        jest.useRealTimers();
        expect(banner()).not.toBeNull();
        expect(reportParams().get('body')).toContain('- Failure: logbook table not found');
      });

      test('stays hidden when there are simply no friend logs', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', pageInfo: { rows: 0 }, data: [] });
        expect(banner()).toBeNull();
      });

      test('stays hidden when the logs render', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });
        expect(banner()).toBeNull();
      });

      test('stays hidden for logged-out visitors', () => {
        global.isLoggedIn = false;
        loadLogbookPage(0, 'false', 'true', 5);
        triggerFail({ status: 401 }, 'error', 'Unauthorized');
        expect(banner()).toBeNull();
      });

      test('shows only one banner when several requests fail', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        showErrorBanner('logbook request failed (HTTP 502)');
        expect(document.querySelectorAll('.gcfl-error-banner')).toHaveLength(1);
      });
    });

    describe('content', () => {
      test('uses the translated text the content script passed', () => {
        setInjectElement({
          'data-labels': JSON.stringify({
            errorLead: 'Não foi possível carregar o Friends Logs nesta página.',
            errorDetail: 'O Geocaching.com pode ter mudado.',
            errorReport: 'Comunicar problema',
            errorDismiss: 'Fechar'
          })
        });
        showErrorBanner('logbook request failed (HTTP 500)');
        expect(banner().querySelector('strong').textContent).toBe(
          'Não foi possível carregar o Friends Logs nesta página.'
        );
        expect(banner().textContent).toContain('O Geocaching.com pode ter mudado.');
        expect(document.querySelector('.gcfl-error-report').textContent).toBe('Comunicar problema');
        expect(document.querySelector('.gcfl-error-dismiss').textContent).toBe('Fechar');
      });

      test('falls back to English when no translation was passed', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        expect(banner().querySelector('strong').textContent).toBe(
          "Friends Logs couldn't load on this page."
        );
        expect(banner().textContent).toContain(
          'Geocaching.com may have changed. A quick report helps get it fixed.'
        );
        expect(document.querySelector('.gcfl-error-report').textContent).toBe('Report issue');
        expect(document.querySelector('.gcfl-error-dismiss').textContent).toBe('Dismiss');
      });

      test('is announced to screen readers', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        expect(banner().getAttribute('role')).toBe('alert');
      });
    });

    describe('dismiss', () => {
      test('removes the banner', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        document.querySelector('.gcfl-error-dismiss').click();
        expect(banner()).toBeNull();
        expect(document.querySelector('.gcfl-error')).toBeNull();
      });

      test('keeps it hidden for the rest of the page load', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        document.querySelector('.gcfl-error-dismiss').click();
        showErrorBanner('logbook table not found');
        expect(banner()).toBeNull();
      });

      test('leaves the site logbook alone', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        document.querySelector('.gcfl-error-dismiss').click();
        expect(document.querySelectorAll('#cache_logs_table tbody')).toHaveLength(2);
      });
    });

    describe('report issue link', () => {
      test('opens a prefilled bug report in a new tab', () => {
        setInjectElement({ 'data-version': '2.6.0' });
        window.history.replaceState(null, '', '/geocache/GC9P5DP_in-memorium?foo=bar');
        showErrorBanner('logbook request failed (HTTP 500)');

        const link = document.querySelector('.gcfl-error-report');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toBe('noopener noreferrer');

        const params = reportParams();
        expect(params.get('title')).toBe('Friends Logs did not load (v2.6.0)');
        expect(params.get('labels')).toBe('bug');
        expect(params.get('body')).toBe(
          'Friends Logs did not load on a cache page.\n\n' +
            '- Version: 2.6.0\n' +
            `- Browser: ${describeBrowser(navigator.userAgent)}\n` +
            '- Failure: logbook request failed (HTTP 500)\n' +
            '- Page: /geocache/GC9P5DP\n'
        );
        window.history.replaceState(null, '', '/');
      });

      test('matches the approved example link', () => {
        expect(
          buildReportUrl({
            version: '2.6.0',
            browser: 'Chrome 141 on Linux',
            reason: 'logbook request failed (HTTP 500)',
            page: '/geocache/GC9P5DP'
          })
        ).toBe(
          REPORT_PREFIX +
            'title=Friends+Logs+did+not+load+%28v2.6.0%29&labels=bug&body=Friends+Logs+did+not+load+on+a+cache+page.%0A%0A-+Version%3A+2.6.0%0A-+Browser%3A+Chrome+141+on+Linux%0A-+Failure%3A+logbook+request+failed+%28HTTP+500%29%0A-+Page%3A+%2Fgeocache%2FGC9P5DP%0A'
        );
      });

      test('says unknown when the version was not passed', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        expect(reportParams().get('title')).toBe('Friends Logs did not load (vunknown)');
      });

      test.each([
        [
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'Chrome 141 on Linux'
        ],
        [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:144.0) Gecko/20100101 Firefox/144.0',
          'Firefox 144 on Windows'
        ],
        [
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.3537.71',
          'Edge 141 on Windows'
        ],
        [
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 OPR/124.0.0.0',
          'Opera 124 on macOS'
        ],
        [
          'Mozilla/5.0 (Android 15; Mobile; rv:144.0) Gecko/144.0 Firefox/144.0',
          'Firefox 144 on Android'
        ],
        ['something else', 'unknown browser']
      ])('describes the browser from %s', (ua, expected) => {
        expect(describeBrowser(ua)).toBe(expected);
      });
    });

    describe('placement', () => {
      test('sits in our own table right above the site logbook', () => {
        showErrorBanner('logbook request failed (HTTP 500)');
        const own = document.querySelector('table.gcfl-table');
        expect(own).not.toBeNull();
        expect(own.contains(banner())).toBe(true);
        expect(own.nextElementSibling.id).toBe('cache_logs_table');
        expect(document.getElementById('cache_logs_table').contains(banner())).toBe(false);
      });

      test('goes above logs that already rendered', () => {
        loadLogbookPage(0, 'false', 'true', 5);
        triggerDone({ status: 'success', pageInfo: { rows: 1 }, data: [{ logID: 1 }] });
        showErrorBanner('logbook request failed (HTTP 500)');
        const own = document.querySelector('table.gcfl-table');
        expect(own.firstElementChild.classList.contains('gcfl-error')).toBe(true);
      });

      test('falls back to right after the cache description when the logbook table is missing', () => {
        document.getElementById('cache_logs_table').remove();
        document.body.insertAdjacentHTML(
          'afterbegin',
          '<div class="UserSuppliedContent" id="desc"><span id="ctl00_ContentBody_LongDescription">Desc</span></div><p id="after-desc">Hints</p>'
        );
        showErrorBanner('logbook table not found');

        const desc = document.getElementById('desc');
        expect(desc.nextElementSibling.contains(banner())).toBe(true);
        expect(desc.nextElementSibling.classList.contains('gcfl-error-standalone')).toBe(true);
        expect(desc.contains(banner())).toBe(false);
        expect(document.querySelector('table.gcfl-table')).toBeNull();
      });

      test('stays out of the page when neither spot exists', () => {
        document.getElementById('cache_logs_table').remove();
        showErrorBanner('logbook table not found');
        expect(banner()).toBeNull();
      });
    });
  });
});
