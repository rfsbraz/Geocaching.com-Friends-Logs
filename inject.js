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
      showErrorBanner('logbook table not found');
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
      showErrorBanner('logbook table not found');
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

  // English section headers, used when the content script passed no translation.
  const DEFAULT_LABELS = {
    friendsLog: '1 Friend Log',
    friendsLogs: '{count} Friends Logs',
    myLog: 'My Log',
    myLogs: 'My Logs',
    logbook: 'Logbook',
    errorLead: "Friends Logs couldn't load on this page.",
    errorDetail: 'Geocaching.com may have changed. A quick report helps get it fixed.',
    errorReport: 'Report issue',
    errorDismiss: 'Dismiss'
  };

  /**
   * Section headers in the browser's language, from the data-labels attribute the
   * content script sets on our script element (#122).
   * @returns {Object<string, string>}
   */
  function getLabels() {
    const el = document.getElementById('inject');
    let passed = {};
    try {
      passed = JSON.parse((el && el.getAttribute('data-labels')) || '{}') || {};
    } catch {
      console.warn('[Friends Logs] Could not read translated labels, using English');
    }
    return Object.assign({}, DEFAULT_LABELS, passed);
  }

  /**
   * Append a section header tbody to our table.
   */
  function appendHeader(own, className, label) {
    const tbody = document.createElement('tbody');
    tbody.className = 'gcfl-header ' + className;
    const tr = document.createElement('tr');
    // One column, like the site's log rows. Our table copies the logbook table's class,
    // which is table-layout: fixed, so a colspan="2" first row split every log row in half (#141).
    const td = document.createElement('td');
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
    const labels = getLabels();

    if (showFriends === 'true') {
      appendHeader(
        own,
        'gcfl-friends-header',
        count === 1 ? labels.friendsLog : labels.friendsLogs.replace('{count}', count)
      );
    } else if (showPersonal === 'true') {
      appendHeader(own, 'gcfl-my-header', count === 1 ? labels.myLog : labels.myLogs);
    }

    // Check for template function
    if (typeof $.tmpl !== 'function') {
      console.error('[Friends Logs] jQuery template plugin not found');
      showErrorBanner('log row template not found');
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
      // ever being a last child so it keeps tracking the real logbook. The spacer is also
      // the gap between this section and the next header (#141).
      const spacer = document.createElement('tr');
      spacer.className = 'gcfl-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.appendChild(document.createElement('td'));
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
      appendHeader(own, 'gcfl-logbook-header', labels.logbook);
    }
  }

  const REPORT_URL = 'https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/new';
  const ERROR_ICON_PATH = 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z';

  /**
   * Short browser and OS name for bug reports, like "Chrome 141 on Linux".
   * @param {string} ua - navigator.userAgent
   * @returns {string}
   */
  function describeBrowser(ua) {
    const browsers = [
      ['Firefox', /Firefox\/(\d+)/],
      ['Edge', /Edg\/(\d+)/],
      ['Opera', /OPR\/(\d+)/],
      ['Chrome', /Chrome\/(\d+)/],
      ['Safari', /Version\/(\d+).*Safari\//]
    ];
    const systems = [
      ['Android', /Android/],
      ['iOS', /iPhone|iPad/],
      ['ChromeOS', /CrOS/],
      ['Windows', /Windows/],
      ['macOS', /Mac OS X|Macintosh/],
      ['Linux', /Linux/]
    ];
    const browser = browsers.find(([, re]) => re.test(ua));
    if (!browser) {
      return 'unknown browser';
    }
    const system = systems.find(([, re]) => re.test(ua));
    const name = browser[0] + ' ' + ua.match(browser[1])[1];
    return system ? name + ' on ' + system[0] : name;
  }

  /**
   * Prefilled GitHub bug report for a failed load (#87). Only the cache page path goes
   * in, never the query string or anything about the user.
   * @param {{version: string, browser: string, reason: string, page: string}} details
   * @returns {string}
   */
  function buildReportUrl(details) {
    const body =
      'Friends Logs did not load on a cache page.\n\n' +
      '- Version: ' +
      details.version +
      '\n' +
      '- Browser: ' +
      details.browser +
      '\n' +
      '- Failure: ' +
      details.reason +
      '\n' +
      '- Page: ' +
      details.page +
      '\n';
    const query = new URLSearchParams({
      title: 'Friends Logs did not load (v' + details.version + ')',
      labels: 'bug',
      body: body
    });
    return REPORT_URL + '?' + query.toString();
  }

  /**
   * The cache page path without the title slug, e.g. /geocache/GC9P5DP.
   * @returns {string}
   */
  function cachePagePath() {
    const match = location.pathname.match(/^\/geocache\/GC[A-Z0-9]+/i);
    return match ? match[0] : location.pathname;
  }

  /**
   * Build the banner element: icon, text, Report issue link and Dismiss button.
   * @param {string} reason - Short English failure reason for the report
   * @param {function(): void} onDismiss
   * @returns {HTMLDivElement}
   */
  function createErrorBanner(reason, onDismiss) {
    const labels = getLabels();
    const el = document.getElementById('inject');
    const version = (el && el.getAttribute('data-version')) || 'unknown';

    const box = document.createElement('div');
    box.className = 'gcfl-error-banner';
    box.setAttribute('role', 'alert');
    box.setAttribute('aria-label', 'Friends Logs');

    const svgNs = 'http://www.w3.org/2000/svg';
    const icon = document.createElementNS(svgNs, 'svg');
    icon.setAttribute('class', 'gcfl-error-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', ERROR_ICON_PATH);
    icon.appendChild(path);

    const text = document.createElement('p');
    text.className = 'gcfl-error-text';
    const lead = document.createElement('strong');
    lead.textContent = labels.errorLead;
    text.append(lead, ' ' + labels.errorDetail);

    const actions = document.createElement('div');
    actions.className = 'gcfl-error-actions';
    const report = document.createElement('a');
    report.className = 'gcfl-error-report';
    report.href = buildReportUrl({
      version: version,
      browser: describeBrowser(navigator.userAgent),
      reason: reason,
      page: cachePagePath()
    });
    report.target = '_blank';
    report.rel = 'noopener noreferrer';
    report.textContent = labels.errorReport;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'gcfl-error-dismiss';
    dismiss.textContent = labels.errorDismiss;
    dismiss.addEventListener('click', onDismiss);

    actions.append(report, dismiss);
    box.append(icon, text, actions);
    return box;
  }

  /**
   * Where the banner goes when the logbook table is missing: right after the cache
   * description, which the site renders server side whether or not the logbook loads.
   * @returns {Element|null} The element to insert the banner after
   */
  function findFallbackSpot() {
    const description = document.getElementById('ctl00_ContentBody_LongDescription');
    if (!description) {
      return null;
    }
    return description.closest('.UserSuppliedContent') || description;
  }

  /**
   * Show a dismissible banner when Friends Logs can't load or read the page (#87),
   * instead of failing with only a console error. One banner per page load; Dismiss
   * hides it until the next page load. Logged-out visitors never see it, since the
   * extension has nothing to show them.
   * @param {string} reason - Short English failure reason for the report link
   * @returns {Element|null} The banner, or null if none was shown
   */
  function showErrorBanner(reason) {
    if (typeof isLoggedIn !== 'undefined' && isLoggedIn === false) {
      return null;
    }
    if (window.__gcflErrorDismissed || document.querySelector('.gcfl-error-banner')) {
      return null;
    }

    let wrapper;
    const remove = function () {
      window.__gcflErrorDismissed = true;
      wrapper.remove();
    };
    const box = createErrorBanner(reason, remove);

    const logTable = findLogTable();
    if (logTable) {
      const own = getOwnTable(logTable);
      wrapper = document.createElement('tbody');
      wrapper.className = 'gcfl-error';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.appendChild(box);
      tr.appendChild(td);
      // Same gap below the banner as after a section's log rows (#141).
      const spacer = document.createElement('tr');
      spacer.className = 'gcfl-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      spacer.appendChild(document.createElement('td'));
      wrapper.append(tr, spacer);
      own.insertBefore(wrapper, own.firstChild);
      return box;
    }

    const spot = findFallbackSpot();
    if (!spot) {
      console.error('[Friends Logs] Nowhere to show the error banner');
      return null;
    }
    wrapper = document.createElement('div');
    wrapper.className = 'gcfl-error-standalone';
    wrapper.appendChild(box);
    spot.parentNode.insertBefore(wrapper, spot.nextSibling);
    return box;
  }

  /**
   * Check the logbook API response has the shape renderSection reads (#93).
   * @param {*} response
   * @returns {boolean}
   */
  function isLogbookResponse(response) {
    return (
      !!response &&
      !!response.pageInfo &&
      typeof response.pageInfo.rows === 'number' &&
      Array.isArray(response.data)
    );
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
      showErrorBanner('page globals not found (userToken)');
      return;
    }

    if (typeof $ === 'undefined' || typeof $.getJSON !== 'function') {
      console.error('[Friends Logs] jQuery not found on page');
      showErrorBanner('page globals not found (jQuery)');
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
        if (!response || response.status !== 'success') {
          console.warn(
            '[Friends Logs] API returned non-success status:',
            response && response.status
          );
          showErrorBanner(
            'logbook API returned ' + (response ? 'status ' + response.status : 'no body')
          );
          return;
        }

        if (!isLogbookResponse(response)) {
          console.warn('[Friends Logs] Unexpected logbook response shape, not rendering');
          showErrorBanner('unexpected logbook response');
          return;
        }

        if (response.pageInfo.rows === 0 && typeof loadPersonalAfter === 'undefined') {
          return;
        }

        whenLogTable(function (logTable) {
          try {
            renderSection(logTable, response, showFriends, showPersonal, loadPersonalAfter);
          } catch (err) {
            console.error('[Friends Logs] Could not render logs:', err);
            showErrorBanner('could not render logs (' + ((err && err.message) || err) + ')');
            return;
          }

          // Load personal logs after friends if both were requested
          if (loadPersonalAfter === 'true') {
            loadLogbookPage(pageIdx, 'true', 'false', limit);
          }
        });
      })
      .fail(function (jqXHR, textStatus, errorThrown) {
        console.error('[Friends Logs] API request failed:', textStatus, errorThrown);
        const status = jqXHR && jqXHR.status;
        showErrorBanner(
          'logbook request failed (' +
            (status ? 'HTTP ' + status : textStatus || 'no response') +
            ')'
        );
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
      showErrorBanner(
        'page globals not found (' +
          (typeof userToken === 'undefined' ? 'userToken' : 'jQuery') +
          ')'
      );
      return;
    }

    console.log('[Friends Logs] Waiting for page globals (' + retries + ' retries left)');
    setTimeout(function () {
      waitForGlobalsAndLoad(retries - 1, showMyLogs, showFriendsLogs, limit);
    }, 500);
  }

  // Enable testing - this block is ignored in the browser
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      loadLogbookPage,
      waitForGlobalsAndLoad,
      findLogTable,
      whenLogTable,
      showErrorBanner,
      buildReportUrl,
      describeBrowser
    };
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
