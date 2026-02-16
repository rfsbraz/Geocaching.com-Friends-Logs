const path = require('path');
const fs = require('fs');

const REAL_PAGES_DIR = path.resolve(__dirname, '..', 'fixtures', 'real-pages');

/**
 * Minimal jQuery stub injected into real saved pages that lack JavaScript.
 * Uses XMLHttpRequest (like real jQuery) instead of fetch for CSP compatibility.
 * Provides only the subset of jQuery that inject.js requires:
 * $(), $.getJSON(), $.tmpl(), .insertBefore(), .addClass(), .find(), .remove()
 */
const JQUERY_STUB = `
(function() {
  if (typeof window.$ !== 'undefined') return;

  function jQueryObj(elements) {
    var obj = Array.isArray(elements) ? elements.slice() : [elements];
    obj.insertBefore = function(target) {
      var el = target && !target.nodeType && typeof target.length === 'number' ? target[0] : target;
      if (el && el.parentNode) {
        for (var i = 0; i < obj.length; i++) {
          el.parentNode.insertBefore(obj[i], el);
        }
      }
      return obj;
    };
    obj.addClass = function(cls) {
      for (var i = 0; i < obj.length; i++) {
        if (obj[i] && obj[i].classList) obj[i].classList.add(cls);
      }
      return obj;
    };
    obj.find = function(selector) {
      var results = [];
      for (var i = 0; i < obj.length; i++) {
        if (obj[i] && obj[i].querySelectorAll) {
          var found = obj[i].querySelectorAll(selector);
          for (var j = 0; j < found.length; j++) results.push(found[j]);
        }
      }
      return jQueryObj(results);
    };
    obj.remove = function() {
      for (var i = 0; i < obj.length; i++) {
        if (obj[i] && obj[i].parentNode) obj[i].parentNode.removeChild(obj[i]);
      }
      return obj;
    };
    obj.each = function(fn) {
      for (var i = 0; i < obj.length; i++) fn.call(obj[i], i, obj[i]);
      return obj;
    };
    obj.data = function() { return ''; };
    return obj;
  }

  function $(selector) {
    if (selector && selector.nodeType) return jQueryObj([selector]);
    if (typeof selector === 'object' && typeof selector.length === 'number') {
      var elems = [];
      for (var i = 0; i < selector.length; i++) {
        if (selector[i] && selector[i].nodeType) elems.push(selector[i]);
      }
      return jQueryObj(elems);
    }
    if (typeof selector === 'string' && selector.charAt(0) === '<') {
      var div = document.createElement('div');
      div.innerHTML = selector;
      var children = [];
      while (div.firstChild) { children.push(div.firstChild); div.removeChild(div.firstChild); }
      return jQueryObj(children);
    }
    return jQueryObj(Array.from(document.querySelectorAll(selector)));
  }

  $.getJSON = function(url, params) {
    var chain = {};
    var doneCallback = null;
    var failCallback = null;
    chain.done = function(cb) { doneCallback = cb; return chain; };
    chain.fail = function(cb) { failCallback = cb; return chain; };
    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');
    var fullUrl = url + '?' + qs;
    var xhr = new XMLHttpRequest();
    xhr.open('GET', fullUrl, true);
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 400) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (doneCallback) doneCallback(data);
        } catch(e) {
          if (failCallback) failCallback(xhr, 'parsererror', e.message);
        }
      } else {
        if (failCallback) failCallback(xhr, 'error', xhr.statusText);
      }
    };
    xhr.onerror = function() {
      if (failCallback) failCallback(xhr, 'error', xhr.statusText);
    };
    xhr.send();
    return chain;
  };

  $.tmpl = function(_templateName, dataArray) {
    var rows = [];
    for (var i = 0; i < dataArray.length; i++) {
      var item = dataArray[i];
      var tbody = document.createElement('tbody');
      tbody.className = 'log-row';
      tbody.setAttribute('data-log-id', item.LogID);
      tbody.innerHTML =
        '<tr><td>' +
        '<div class="FloatLeft LogDisplayLeft">' +
        '<strong>' + (item.UserName || 'Unknown') + '</strong>' +
        '</div>' +
        '<div class="FloatLeft LogDisplayRight">' +
        '<div class="HalfLeft LogType"><span class="h4 log-meta">' + (item.LogType || '') + '</span></div>' +
        '<div class="HalfRight AlignRight"><span class="minorDetails LogDate">' + (item.Visited || '') + '</span></div>' +
        '<div class="Clear LogContent markdown-output"><div class="LogText">' + (item.LogText || '') + '</div></div>' +
        '</div>' +
        '</td></tr>';
      rows.push(tbody);
    }
    return jQueryObj(rows);
  };

  $.fn = {};
  window.$ = $;
  window.jQuery = $;
})();
`;

/**
 * Discover real page HTML files in the fixtures directory.
 * Returns array of filenames (empty if directory doesn't exist).
 */
function discoverRealPages() {
  if (!fs.existsSync(REAL_PAGES_DIR)) {
    return [];
  }
  return fs.readdirSync(REAL_PAGES_DIR).filter(f => f.endsWith('.html'));
}

/**
 * Prepare a real saved HTML page for testing.
 * - Strips SingleFile's restrictive CSP (default-src 'none')
 * - Strips baked-in extension elements from previous sessions
 * - Injects jQuery stub + test globals
 *
 * @param {string} htmlFile - Filename of the HTML file
 * @returns {{ htmlContent: string, gcCode: string }}
 */
function prepareRealPage(htmlFile) {
  const htmlPath = path.join(REAL_PAGES_DIR, htmlFile);
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  // Extract GC code from filename, default to GCTEST
  const gcMatch = htmlFile.match(/GC[A-Z0-9]+/i);
  const gcCode = gcMatch ? gcMatch[0].toUpperCase() : 'GCTEST';

  // Strip SingleFile's restrictive CSP that blocks network requests
  htmlContent = htmlContent.replace(/<meta[^>]*content-security-policy[^>]*>/gi, '');

  // Strip any existing extension elements from a previous session
  // (SingleFile saves the DOM including extension-injected content)
  htmlContent = htmlContent
    .replace(/<h3[^>]*class="[^"]*gcfl-[^"]*"[^>]*>.*?<\/h3>/gi, '')
    .replace(/<br[^>]*data-sf-nesting[^>]*>/gi, '')
    .replace(/\sgcfl-friends-log|\sgcfl-my-log/gi, '');

  // Inject jQuery stub + globals (before </head> or at start of <body>)
  const injection = `<script>
    window.userToken = 'test-token-for-e2e';
    window.decryptLogs = false;
    ${JQUERY_STUB}
  </script>`;

  if (htmlContent.includes('</head>')) {
    htmlContent = htmlContent.replace('</head>', injection + '</head>');
  } else if (htmlContent.includes('<body')) {
    htmlContent = htmlContent.replace(/<body([^>]*)>/, '<body$1>' + injection);
  } else {
    htmlContent = injection + htmlContent;
  }

  return { htmlContent, gcCode };
}

module.exports = { REAL_PAGES_DIR, discoverRealPages, prepareRealPage };
