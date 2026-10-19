#!/usr/bin/env node
/**
 * Weekly store listing drift check (#115).
 *
 * Reads the public listing of every language on the Chrome Web Store, Edge
 * Add-ons and Firefox Add-ons, with no login and no cookies, and compares it
 * with store-listing/. Writes one Markdown report per drifted store, with the
 * exact text to paste for each language, plus summary.json. It never creates
 * issues itself; .github/workflows/store-drift.yml does that from the reports.
 *
 * Usage:
 *   node scripts/store-drift.js [--out drift]
 */
const fs = require('fs');
const path = require('path');
const { loadListing, descriptionText } = require('./store-listing');
const { plainText } = require('./amo-listing');

const ROOT = path.join(__dirname, '..');
const STORES = ['chrome', 'edge', 'firefox'];
const STORE_NAMES = {
  chrome: 'Chrome Web Store',
  edge: 'Edge Add-ons',
  firefox: 'Firefox Add-ons'
};
const HEADERS = {
  Accept: 'text/html,application/json',
  'User-Agent':
    'Geocaching.com-Friends-Logs listing drift check (github.com/rfsbraz/Geocaching.com-Friends-Logs)'
};

/**
 * What each language should show on a store. Chrome and Edge take the summary
 * from the package (_locales), so a language the package does not ship shows
 * the default language's summary there. Firefox's summary is set through AMO.
 */
function expectedFor(listing, store, shipped) {
  const { config, locales } = listing;
  const main = locales[config.defaultLocale];
  return config.locales.map(id => {
    const l = locales[id];
    const fromPackage = store !== 'firefox';
    const summary = !fromPackage || shipped.has(l.extensionLocale) ? l.summary : main.summary;
    return {
      id,
      language: l.language,
      code: l.storeLocales[store],
      extensionLocale: l.extensionLocale,
      summary,
      description: descriptionText(l)
    };
  });
}

/** Summary and description from a public Chrome Web Store item page. */
function parseChromePage(html) {
  const locale = (html.match(/<html[^>]*\blang="([^"]+)"/) || [])[1];
  const meta = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  const overview = (html.match(/<div jsname="ij8cu"[^>]*>([\s\S]*?)<\/div>/) || [])[1];
  const paragraphs = overview ? [...overview.matchAll(/<p>([\s\S]*?)<\/p>/g)].map(m => m[1]) : [];
  if (!locale || meta == null || !paragraphs.length) {
    throw new Error('the Chrome page layout changed: summary or description not found');
  }
  return {
    locale,
    summary: plainText(meta),
    description: plainText(paragraphs[paragraphs.length - 1])
  };
}

/** Summary and description from Edge's public product details (what its item page loads). */
function parseEdgeDetails(json) {
  return { locale: json.locale, summary: json.shortDescription, description: json.description };
}

const squash = s =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** Languages whose live text differs from the source. Stores reflow whitespace, so it is ignored. */
function findDrift(expected, live) {
  const drift = [];
  for (const e of expected) {
    const got = live[e.id];
    const fields = [];
    if (got.locale && got.locale.toLowerCase() !== e.code.toLowerCase()) {
      fields.push('locale');
    } else {
      for (const field of ['summary', 'description']) {
        if (squash(got[field]) !== squash(e[field])) {
          fields.push(field);
        }
      }
    }
    if (fields.length) {
      drift.push({ ...e, fields, live: got });
    }
  }
  return drift;
}

const WHERE = {
  chrome: 'the Store listing tab of the Chrome Web Store developer dashboard',
  edge: 'Store listings in Partner Center (add the language first if it is not listed)',
  firefox: 'the AMO developer hub, or run the AMO listing workflow with "apply" ticked'
};

/** Issue body for one store: what drifted and the exact text to paste per language. */
function renderIssue(store, drift) {
  const lines = [
    `The public ${STORE_NAMES[store]} listing differs from \`store-listing/\` in ${drift.length} language(s).`,
    `Paste the text below in ${WHERE[store]}.`,
    ''
  ];
  for (const d of drift) {
    lines.push(`### ${d.language}, \`${d.code}\``, '');
    if (d.fields.includes('locale')) {
      lines.push(
        `The store answered \`${d.code}\` with \`${d.live.locale}\`. Check \`storeLocales.${store}\` in \`store-listing/locales/${d.id}.json\`.`,
        ''
      );
      continue;
    }
    if (d.fields.includes('description')) {
      lines.push('Description:', '', '```text', d.description, '```', '');
    }
    if (d.fields.includes('summary')) {
      if (store === 'firefox') {
        lines.push('Summary:', '', '```text', d.summary, '```', '');
      } else {
        lines.push(
          store === 'edge'
            ? `Summary: comes from the package, \`_locales/${d.extensionLocale}/messages.json\`. Edge shows it once the language is added under Store listings, otherwise it changes with the next release upload. Expected:`
            : `Summary: comes from the package, \`_locales/${d.extensionLocale}/messages.json\`. It changes with the next release upload. Expected:`,
          '',
          `> ${d.summary}`,
          ''
        );
      }
    }
  }
  return lines.join('\n');
}

async function readChrome(fetch, id, code) {
  const url = `https://chromewebstore.google.com/detail/${id}?hl=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${url} answered HTTP ${res.status}`);
  }
  return parseChromePage(await res.text());
}

async function readEdge(fetch, id, code) {
  const url = `https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/${id}?hl=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${url} answered HTTP ${res.status}`);
  }
  return parseEdgeDetails(await res.json());
}

async function readFirefox(fetch, guid) {
  const url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(guid)}/`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`${url} answered HTTP ${res.status}`);
  }
  const addon = await res.json();
  return code => ({
    locale: code,
    summary: addon.summary && addon.summary[code] != null ? plainText(addon.summary[code]) : null,
    description:
      addon.description && addon.description[code] != null
        ? plainText(addon.description[code])
        : null
  });
}

/** { store: { status: 'clean' | 'drift' | 'error', drift, errors } } */
async function checkStores({ listing, shipped, fetch }) {
  const ids = listing.config.storeIds;
  const result = {};
  for (const store of STORES) {
    const expected = expectedFor(listing, store, shipped);
    const live = {};
    const errors = [];
    try {
      const firefox = store === 'firefox' ? await readFirefox(fetch, ids.firefox) : null;
      for (const e of expected) {
        try {
          if (store === 'chrome') {
            live[e.id] = await readChrome(fetch, ids.chrome, e.code);
          } else if (store === 'edge') {
            live[e.id] = await readEdge(fetch, ids.edge, e.code);
          } else {
            live[e.id] = firefox(e.code);
          }
        } catch (err) {
          errors.push(`${e.code}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(err.message);
    }
    if (errors.length) {
      result[store] = { status: 'error', drift: [], errors };
      continue;
    }
    const drift = findDrift(expected, live);
    result[store] = { status: drift.length ? 'drift' : 'clean', drift, errors };
  }
  return result;
}

async function main() {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(i > -1 ? process.argv[i + 1] : 'drift');
  const listing = loadListing(ROOT);
  const shipped = new Set(fs.readdirSync(path.join(ROOT, '_locales')));
  const result = await checkStores({ listing, shipped, fetch: globalThis.fetch });
  fs.mkdirSync(out, { recursive: true });
  const summary = {};
  for (const store of STORES) {
    const r = result[store];
    summary[store] = { status: r.status, title: `Store listing drift: ${STORE_NAMES[store]}` };
    const file = path.join(out, `${store}.md`);
    if (r.status === 'drift') {
      fs.writeFileSync(file, renderIssue(store, r.drift));
    } else if (r.status === 'error') {
      fs.writeFileSync(file, r.errors.map(e => `- ${e}`).join('\n') + '\n');
    }
    const detail =
      r.status === 'drift'
        ? `: ${r.drift.map(d => `${d.code} (${d.fields.join(', ')})`).join('; ')}`
        : r.status === 'error'
          ? `: ${r.errors.join('; ')}`
          : '';
    console.log(`${STORE_NAMES[store]}: ${r.status}${detail}`);
  }
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  // Drift is a finding, not a failure. A store that could not be read is.
  process.exit(Object.values(result).some(r => r.status === 'error') ? 1 : 0);
}

if (require.main === module) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  expectedFor,
  parseChromePage,
  parseEdgeDetails,
  findDrift,
  renderIssue,
  checkStores
};
