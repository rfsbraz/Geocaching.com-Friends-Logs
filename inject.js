/**
 * Injected script that runs in the page context to access geocaching.com's
 * jQuery, userToken, and other page globals.
 */

(function () {
  'use strict';

  // Guard against duplicate execution (e.g. Firefox bfcache re-injection race)
  if (window.__gcflExecuted) {
    console.log('[Friends Logs] Already executed, skipping');
    return;
  }
  // DOM-based guard: catches races where two script loads execute before either sets the flag
  if (document.querySelector('.gcfl-header')) {
    console.log('[Friends Logs] Content already exists, skipping');
    return;
  }
  window.__gcflExecuted = true;

  console.log('[Friends Logs] Inject script executing');

  // Logbook table selectors, newest first, with the legacy id as the primary contract.
  const LOG_TABLE_SELECTORS = [
    '#cache_logs_table',
    'table.LogsTable',
    '#cache_logs_container table'
  ];
  const LOG_TABLE_TIMEOUT_MS = 20000;

  /**
   * Find the site's logbook table (never our own .gcfl-table).
   * @returns {HTMLTableElement|null}
   */
  function findLogTable() {
    for (const selector of LOG_TABLE_SELECTORS) {
      const match = Array.from(document.querySelectorAll(selector)).find(function (el) {
        return el.tagName === 'TABLE' && !el.classList.contains('gcfl-table');
      });
      if (match) {
        return match;
      }
    }
    const row = Array.from(document.querySelectorAll('.log-row')).find(function (el) {
      return !el.closest('.gcfl-table');
    });
    return row ? row.closest('table') : null;
  }

  /**
   * Run callback with the logbook table, waiting for it if the page adds it later.
   * @param {function(HTMLTableElement): void} callback
   */
  function whenLogTable(callback) {
    const found = findLogTable();
    if (found) {
      callback(found);
      return;
    }
    if (typeof MutationObserver === 'undefined') {
      console.error('[Friends Logs] Logbook table not found');
      return;
    }
    let timer = null;
    const observer = new MutationObserver(function () {
      const table = findLogTable();
      if (table) {
        observer.disconnect();
        clearTimeout(timer);
        callback(table);
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    timer = setTimeout(function () {
      observer.disconnect();
      console.error(
        '[Friends Logs] Logbook table not found (logged out, or the site markup changed)'
      );
    }, LOG_TABLE_TIMEOUT_MS);
  }

  /**
   * Our own table, placed right before the site's logbook table. The site lazy-loads
   * the logbook on scroll and clears every .log-row and tbody in its table first,
   * so anything injected inside it was wiped (#85). A sibling table survives that.
   * @param {HTMLTableElement} logTable
   * @returns {HTMLTableElement}
   */
  function getOwnTable(logTable) {
    const existing = document.querySelector('table.gcfl-table');
    if (existing) {
      return existing;
    }
    const own = document.createElement('table');
    own.className = (logTable.className ? logTable.className + ' ' : '') + 'gcfl-table';
    logTable.parentNode.insertBefore(own, logTable);
    return own;
  }

  /**
   * Append a section header tbody to our table.
   */
  function appendHeader(own, className, label) {
    const tbody = document.createElement('tbody');
    tbody.className = 'gcfl-header ' + className;
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.textContent = label;
    tr.appendChild(td);
    tbody.appendChild(tr);
    own.appendChild(tbody);
  }

  /**
   * Render one API response (friends or personal logs) into our table.
   */
  function renderSection(logTable, response, showFriends, showPersonal, loadPersonalAfter) {
    const own = getOwnTable(logTable);
    const count = response.pageInfo.rows;

    if (showFriends === 'true') {
      appendHeader(
        own,
        'gcfl-friends-header',
        count === 1 ? '1 Friend Log' : count + ' Friends Logs'
      );
    } else if (showPersonal === 'true') {
      appendHeader(own, 'gcfl-my-header', count === 1 ? 'My Log' : 'My Logs');
    }

    // Check for template function
    if (typeof $.tmpl !== 'function') {
      console.error('[Friends Logs] jQuery template plugin not found');
      return;
    }

    const logs = $.tmpl('tmplCacheLogRow', response.data);

    // Fix: remove nested tables that cause display issues
    // https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/1
    $(logs).find('table').remove();

    // Add styling class to log rows
    if (showFriends === 'true') {
      logs.addClass('gcfl-friends-log');
    } else if (showPersonal === 'true') {
      logs.addClass('gcfl-my-log');
    }

    // The template renders <tr class="log-row"> today; older markup used <tbody> rows.
    const rowsBody = document.createElement('tbody');
    rowsBody.className = 'gcfl-rows';
    for (let i = 0; i < logs.length; i++) {
      const el = logs[i];
      if (!el || !el.nodeType || el.nodeType !== 1) {
        continue;
      }
      if (el.tagName === 'TBODY') {
        own.appendChild(el);
      } else {
        rowsBody.appendChild(el);
      }
    }
    if (rowsBody.children.length) {
      // The site's infinite scroll measures $('.log-row:last-child'); keep our rows from
      // ever being a last child so it keeps tracking the real logbook.
      const spacer = document.createElement('tr');
      spacer.className = 'gcfl-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      rowsBody.appendChild(spacer);
      own.appendChild(rowsBody);
    }

    // Initialize fancybox for log images if available
    if (typeof $.fn !== 'undefined' && typeof $.fn.fancybox === 'function') {
      logs.find('a.tb_images').each(function () {
        const $this = $(this);
        $this.fancybox({
          type: 'image',
          titlePosition: 'inside',
          padding: 10,
          titleFormat: function () {
            return $this.data('title');
          }
        });
      });
    }

    // Add main logbook header if not loading personal logs after
    if (typeof loadPersonalAfter === 'undefined') {
      appendHeader(own, 'gcfl-logbook-header', 'Logbook');
    }
  }

  /**
   * Load logs from the geocaching.com logbook API.
   * @param {number} pageIdx - Page index (0-based)
   * @param {string} showPersonal - "true" or "false" string
   * @param {string} showFriends - "true" or "false" string
   * @param {number|string} limit - Number of logs to fetch
   */
  function loadLogbookPage(pageIdx, showPersonal, showFriends, limit) {
    // Check for required page dependencies
    if (typeof userToken === 'undefined') {
      console.error('[Friends Logs] userToken not found on page');
      return;
    }

    if (typeof $ === 'undefined' || typeof $.getJSON !== 'function') {
      console.error('[Friends Logs] jQuery not found on page');
      return;
    }

    let loadPersonalAfter;

    // If both friends and personal logs requested, load friends first
    if (showFriends === 'true' && showPersonal === 'true') {
      showPersonal = 'false';
      loadPersonalAfter = 'true';
    }

    // decryptLogs may not exist on all pages, default to false
    const decrypt = typeof decryptLogs !== 'undefined' ? decryptLogs : false;

    $.getJSON('/seek/geocache.logbook', {
      tkn: userToken,
      idx: pageIdx + 1,
      num: limit,
      sp: showPersonal,
      sf: showFriends,
      decrypt: decrypt
    })
      .done(function (response) {
        if (response.status !== 'success') {
          console.warn('[Friends Logs] API returned non-success status:', response.status);
          return;
        }

        if (response.pageInfo.rows === 0 && typeof loadPersonalAfter === 'undefined') {
          return;
        }

        whenLogTable(function (logTable) {
          renderSection(logTable, response, showFriends, showPersonal, loadPersonalAfter);

          // Load personal logs after friends if both were requested
          if (loadPersonalAfter === 'true') {
            loadLogbookPage(pageIdx, 'true', 'false', limit);
          }
        });
      })
      .fail(function (jqXHR, textStatus, errorThrown) {
        console.error('[Friends Logs] API request failed:', textStatus, errorThrown);
      });
  }

  /**
   * Wait for page globals (userToken, jQuery) to be available before loading logs.
   * Retries up to maxRetries times at 500ms intervals.
   * @param {number} retries - Number of retries remaining
   * @param {string} showMyLogs - "true" or "false"
   * @param {string} showFriendsLogs - "true" or "false"
   * @param {number|string} limit - Number of logs to fetch
   */
  function waitForGlobalsAndLoad(retries, showMyLogs, showFriendsLogs, limit) {
    if (typeof userToken !== 'undefined' && typeof $ !== 'undefined') {
      loadLogbookPage(0, showMyLogs, showFriendsLogs, limit);
      return;
    }

    if (retries <= 0) {
      console.error('[Friends Logs] Page globals not available after retries');
      return;
    }

    console.log('[Friends Logs] Waiting for page globals (' + retries + ' retries left)');
    setTimeout(function () {
      waitForGlobalsAndLoad(retries - 1, showMyLogs, showFriendsLogs, limit);
    }, 500);
  }

  // Enable testing - this block is ignored in the browser
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadLogbookPage, waitForGlobalsAndLoad, findLogTable, whenLogTable };
    return; // Skip auto-execution in test environment
  }

  // Get settings from the injected script element
  const injectElement = document.getElementById('inject');
  if (!injectElement) {
    console.error('[Friends Logs] Inject element not found');
    return;
  }

  const showMyLogs = injectElement.getAttribute('showMyLogs');
  const showFriendsLogs = injectElement.getAttribute('showFriendsLogs');
  const limit = injectElement.getAttribute('limit');

  waitForGlobalsAndLoad(10, showMyLogs, showFriendsLogs, limit);
})();
