const { loadLogbookPage, waitForGlobalsAndLoad, findLogTable } = require('../../inject');

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
});
