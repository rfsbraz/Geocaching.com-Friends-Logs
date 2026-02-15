/**
 * Injected script that runs in the page context to access geocaching.com's
 * jQuery, userToken, and other page globals.
 */

(function () {
  'use strict';

  console.log('[Friends Logs] Inject script executing');

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

        const logTable = document.getElementById('cache_logs_table');
        const logContainer = document.getElementById('cache_logs_container');

        if (!logTable || !logContainer) {
          console.error('[Friends Logs] Required DOM elements not found');
          return;
        }

        const logTbody = logTable.firstChild;

        // Mark the main tbody for reference (only once)
        if ($('.main_tbody').length === 0 && logTbody.nextSibling) {
          logTbody.nextSibling.className = 'main_tbody';
        }

        // Add section header with styling
        if (showFriends === 'true') {
          const breakLine = typeof loadPersonalAfter !== 'undefined' ? '<br>' : '';
          const count = response.pageInfo.rows;
          const label = count === 1 ? '1 Friend Log' : count + ' Friends Logs';
          $(
            breakLine + '<h3 class="gcfl-header gcfl-friends-header">' + label + '</h3>'
          ).insertBefore(logContainer.firstChild.nextSibling.firstChild);
        } else if (showPersonal === 'true') {
          const count = response.pageInfo.rows;
          const label = count === 1 ? 'My Log' : 'My Logs';
          $('<h3 class="gcfl-header gcfl-my-header">' + label + '</h3>').insertBefore(
            logContainer.firstChild.nextSibling.firstChild
          );
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

        logs.insertBefore(logTbody);

        // Initialize fancybox for log images if available
        if (typeof $.fn.fancybox === 'function') {
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
          $('<br><h3 class="gcfl-header gcfl-logbook-header">Logbook</h3>').insertBefore(
            $('.main_tbody')
          );
        }

        // Load personal logs after friends if both were requested
        if (loadPersonalAfter === 'true') {
          loadLogbookPage(pageIdx, 'true', 'false', limit);
        }
      })
      .fail(function (jqXHR, textStatus, errorThrown) {
        console.error('[Friends Logs] API request failed:', textStatus, errorThrown);
      });
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

  /**
   * Wait for page globals (userToken, jQuery) to be available before loading logs.
   * Retries up to 10 times at 500ms intervals (5s total).
   */
  function waitForGlobalsAndLoad(retries) {
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
      waitForGlobalsAndLoad(retries - 1);
    }, 500);
  }

  waitForGlobalsAndLoad(10);
})();
