const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { launchChromiumWithExtension } = require('./helpers/extension');
const { friendsLogsResponse } = require('./fixtures/mock-api-responses');

const REAL_PAGES_DIR = path.resolve(__dirname, 'fixtures', 'real-pages');
const SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');

// Discover real page HTML files (gitignored, user-provided)
const htmlFiles = fs.existsSync(REAL_PAGES_DIR)
  ? fs.readdirSync(REAL_PAGES_DIR).filter(f => f.endsWith('.html'))
  : [];

/**
 * Minimal jQuery stub injected into real saved pages that lack JavaScript.
 * Provides only the subset of jQuery that inject.js requires:
 * $(), $.getJSON(), $.tmpl(), .insertBefore(), .addClass(), .find(), .remove()
 */
const JQUERY_STUB = `
(function() {
  if (typeof window.$ !== 'undefined') return; // jQuery already present

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

test.describe('Real Page Tests', () => {
  // Skip entire suite if no real pages available
  test.skip(htmlFiles.length === 0, 'No HTML files in tests/e2e/fixtures/real-pages/');

  /** @type {import('@playwright/test').BrowserContext} */
  let context;

  test.beforeAll(async () => {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
    ({ context } = await launchChromiumWithExtension());
  });

  test.afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  for (const htmlFile of htmlFiles) {
    test(`extension renders on real page: ${htmlFile}`, async () => {
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

      const page = await context.newPage();

      // Route: serve the real page HTML
      await page.route(`**/geocache/${gcCode}`, async route => {
        await route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: htmlContent
        });
      });

      // Route: intercept ALL logbook API calls (return mock friends data)
      await page.route('**/seek/geocache.logbook*', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(friendsLogsResponse)
        });
      });

      // Collect console messages for debugging
      const consoleLogs = [];
      page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

      await page.goto(`https://www.geocaching.com/geocache/${gcCode}`);

      // Wait for extension to inject and render friends logs
      await expect(page.locator('.gcfl-friends-header')).toBeVisible({ timeout: 15000 });
      await page.waitForTimeout(1000);

      // Log console output for debugging
      const extensionLogs = consoleLogs.filter(l => l.includes('Friends Logs'));
      if (extensionLogs.length > 0) {
        console.log('Extension logs:', extensionLogs.join('\n'));
      }

      // Verify friends logs rendered (use regex to handle singular/plural)
      await expect(page.locator('.gcfl-friends-header')).toContainText(/Friends? Log/);
      const friendLogCount = await page.locator('.gcfl-friends-log').count();
      expect(friendLogCount).toBeGreaterThan(0);
      await expect(page.locator('.gcfl-logbook-header')).toBeVisible();

      // Screenshot
      const screenshotName = `real-page-${gcCode}.png`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotName);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      await test.info().attach(screenshotName.replace('.png', ''), {
        path: screenshotPath,
        contentType: 'image/png'
      });

      await page.close();
    });
  }
});
