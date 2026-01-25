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
  s.setAttribute('src', file);
  s.setAttribute('id', 'inject');
  s.setAttribute('showFriendsLogs', String(showFriendsLogs));
  s.setAttribute('showMyLogs', String(showMyLogs));
  s.setAttribute('limit', String(limit));
  th.appendChild(s);
}

chrome.storage.local.get(DEFAULT_VALUES, function (items) {
  const showMyLogs = items.showMyLogs;
  const showFriendsLogs = items.showFriendsLogs;
  const limit = items.limit;

  // Only inject if at least one option is enabled and not already injected
  if ((showMyLogs || showFriendsLogs) && !document.getElementById('inject')) {
    injectScript(chrome.runtime.getURL('inject.js'), 'body', showMyLogs, showFriendsLogs, limit);
  }
});
