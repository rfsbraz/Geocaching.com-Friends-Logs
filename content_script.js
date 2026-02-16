/* global DEFAULT_VALUES */

/**
 * Content script that injects the main script into the page context.
 * This is needed because the page's jQuery, userToken, and other globals
 * are not accessible from the content script context.
 */

function injectScript(file, node, showMyLogs, showFriendsLogs, limit) {
  const th = document.getElementsByTagName(node)[0];
  if (!th) {
    console.error('[Friends Logs] Could not find element:', node);
    return;
  }

  const s = document.createElement('script');
  s.setAttribute('type', 'text/javascript');
  s.setAttribute('src', file + '?t=' + Date.now());
  s.setAttribute('id', 'inject');
  s.setAttribute('showFriendsLogs', String(showFriendsLogs));
  s.setAttribute('showMyLogs', String(showMyLogs));
  s.setAttribute('limit', String(limit));
  th.appendChild(s);
}

function doInject() {
  // Only inject if not already injected
  if (document.getElementById('inject')) {
    return;
  }

  chrome.storage.local.get(DEFAULT_VALUES, function (items) {
    if (chrome.runtime.lastError) {
      console.warn('[Friends Logs] Storage read failed:', chrome.runtime.lastError.message);
      // Fall back to defaults so injection still happens
      items = DEFAULT_VALUES;
    }

    const showMyLogs = items.showMyLogs;
    const showFriendsLogs = items.showFriendsLogs;
    const limit = items.limit;

    // Only inject if at least one option is enabled and not already injected
    if ((showMyLogs || showFriendsLogs) && !document.getElementById('inject')) {
      console.log('[Friends Logs] Injecting script');
      injectScript(chrome.runtime.getURL('inject.js'), 'body', showMyLogs, showFriendsLogs, limit);
    }
  });
}

console.log('[Friends Logs] Content script loaded');
doInject();

// Handle pages restored from bfcache (back/forward cache)
window.addEventListener('pageshow', function (event) {
  if (event.persisted) {
    console.log('[Friends Logs] Page restored from bfcache, re-injecting');
    // Remove old inject element so the guard check passes
    const old = document.getElementById('inject');
    if (old) {
      old.remove();
    }
    doInject();
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { injectScript, doInject };
}
