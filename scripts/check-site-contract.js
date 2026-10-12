#!/usr/bin/env node
/**
 * Live-site canary for the geocaching.com contract that inject.js relies on (#86).
 *
 * Usage:
 *   node scripts/check-site-contract.js [cache-page-url]
 *
 * Fetches a public cache page logged out plus its cachedetails-main bundle and
 * asserts each contract point. Exits 1 with a list of failures on drift.
 * Logged-out pages do not render the logbook table, so the table is checked
 * through the bundle that populates it.
 */
'use strict';

const DEFAULT_URL = 'https://www.geocaching.com/geocache/GC9P5DP_in-memorium-virtual-reward-3-0';
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36';

/**
 * Check the page HTML and the cachedetails-main bundle against the contract.
 * @param {string} html - Cache page HTML
 * @param {string} bundle - cachedetails-main bundle source ('' if unavailable)
 * @returns {string[]} Failures; empty means the contract holds
 */
function checkContract(html, bundle) {
  const failures = [];
  if (!/\buserToken\s*=\s*'[^']+'/.test(html)) {
    failures.push('userToken assignment not found in page HTML');
  }
  const tmpl = html.match(/<script id="tmpl_CacheLogRow"[^>]*>([\s\S]*?)<\/script>/);
  if (!tmpl) {
    failures.push('#tmpl_CacheLogRow template not found');
  } else if (!/^\s*<tr class="log-row\b/.test(tmpl[1])) {
    failures.push('tmpl_CacheLogRow no longer renders a <tr class="log-row"> root');
  }
  if (!/\.template\(\s*["']tmplCacheLogRow["']\s*\)/.test(html)) {
    failures.push('tmplCacheLogRow template registration not found');
  }
  if (!bundle) {
    failures.push('cachedetails-main bundle not found');
  } else {
    if (!bundle.includes('#cache_logs_table')) {
      failures.push('site bundle no longer targets #cache_logs_table (logbook container moved)');
    }
    if (!bundle.includes('/seek/geocache.logbook')) {
      failures.push('site bundle no longer calls /seek/geocache.logbook');
    }
  }
  return failures;
}

async function main() {
  const url = process.argv[2] || DEFAULT_URL;
  const get = async u => {
    const res = await fetch(u, { headers: { 'User-Agent': UA } });
    if (!res.ok) {
      throw new Error(`${u} -> HTTP ${res.status}`);
    }
    return res.text();
  };
  const html = await get(url);
  const m = html.match(/src="(\/bundle\/cachedetails-main\?[^"]+)"/);
  const bundle = m ? await get(new URL(m[1], url).href) : '';
  const failures = checkContract(html, bundle);
  if (failures.length) {
    console.error('Site contract drift:\n- ' + failures.join('\n- '));
    process.exit(1);
  }
  console.log('Site contract OK for ' + url);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { checkContract };
