#!/usr/bin/env node
/**
 * Sync the Firefox (AMO) listing text from the store listing source of truth (#113).
 *
 * Reads store-listing/ with loadListing(), maps each language to its AMO code
 * (storeLocales.firefox) and compares summary and description with the live
 * listing from the public AMO v5 API. Without --apply it only prints the diff.
 * With --apply it sends one PATCH per changed locale to
 * /api/v5/addons/addon/{guid}/, signed with AMO_JWT_ISSUER and AMO_JWT_SECRET.
 *
 * Usage:
 *   node scripts/amo-listing.js            dry run: print the diff, write nothing
 *   node scripts/amo-listing.js --apply    PATCH every locale that differs
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadListing, descriptionText } = require('./store-listing');

const API = 'https://addons.mozilla.org/api/v5/addons/addon/';
const FIELDS = ['summary', 'description'];

/** { amoLocale: { summary, description } } from the listing. */
function amoPayload(listing) {
  const out = {};
  for (const id of listing.config.locales) {
    const locale = listing.locales[id];
    out[locale.storeLocales.firefox] = {
      summary: locale.summary,
      description: descriptionText(locale)
    };
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * AMO returns descriptions as HTML: URLs are turned into links through its
 * outgoing redirector and text is escaped. Turn that back into plain text.
 */
function plainText(html) {
  let text = String(html)
    .replace(/<a\b[^>]*>(.*?)<\/a>/gis, '$1')
    .replace(/<br\s*\/?>/gi, '\n');
  // Repeat until stable so removing one tag cannot leave another one behind.
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return String.fromCodePoint(code);
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Line endings and trailing spaces are not changes worth a PATCH. */
function comparable(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

/** [{ locale, field, live, source }] for every field that differs from the live listing. */
function diffListing(payload, addon) {
  const changes = [];
  for (const [locale, fields] of Object.entries(payload)) {
    for (const field of FIELDS) {
      const raw = addon[field] && addon[field][locale];
      const live = raw == null ? null : plainText(raw);
      if (live == null || comparable(live) !== comparable(fields[field])) {
        changes.push({ locale, field, live, source: fields[field] });
      }
    }
  }
  return changes;
}

/** A short-lived AMO API token: HS256 JWT with iss, jti, iat and exp (AMO allows at most 5 minutes). */
function jwtToken(issuer, secret, now = Math.floor(Date.now() / 1000)) {
  const part = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header = part({ alg: 'HS256', typ: 'JWT' });
  const payload = part({
    iss: issuer,
    jti: crypto.randomBytes(16).toString('hex'),
    iat: now,
    exp: now + 60
  });
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

/** Minimal line diff (longest common subsequence), for readable dry-run output. */
function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push(`- ${a[i++]}`);
    } else {
      out.push(`+ ${b[j++]}`);
    }
  }
  while (i < a.length) {
    out.push(`- ${a[i++]}`);
  }
  while (j < b.length) {
    out.push(`+ ${b[j++]}`);
  }
  return out.join('\n');
}

function formatChanges(changes, addon, payload) {
  const lines = [];
  for (const c of changes) {
    lines.push(`=== ${c.locale} ${c.field} (${c.live == null ? 'missing on AMO' : 'differs'})`);
    lines.push(lineDiff(c.live == null ? '' : comparable(c.live), comparable(c.source)));
    lines.push('');
  }
  const extra = Object.keys(addon.summary || {}).filter(l => !(l in payload));
  for (const l of extra) {
    lines.push(`=== ${l}: on AMO but not in the listing source, left unchanged`);
  }
  return lines.join('\n');
}

/**
 * Compare the listing with AMO and, when apply is true, PATCH each changed locale.
 * Returns { changes, patched }.
 */
async function syncAmo({ listing, guid, fetch, apply, credentials = {}, log = console.log }) {
  const url = `${API}${encodeURIComponent(guid)}/`;
  if (apply && !(credentials.issuer && credentials.secret)) {
    throw new Error('AMO_JWT_ISSUER and AMO_JWT_SECRET are required for --apply');
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`reading ${url} failed with HTTP ${res.status}`);
  }
  const addon = await res.json();
  const payload = amoPayload(listing);
  const changes = diffListing(payload, addon);

  log(changes.length ? formatChanges(changes, addon, payload) : 'AMO listing matches the source.');
  log(
    `${changes.length} field(s) differ across ${new Set(changes.map(c => c.locale)).size} locale(s).`
  );

  const patched = [];
  if (!apply) {
    log('Dry run: nothing was sent to AMO.');
    return { changes, patched };
  }
  for (const locale of [...new Set(changes.map(c => c.locale))]) {
    const body = {};
    for (const field of FIELDS) {
      body[field] = { [locale]: payload[locale][field] };
    }
    const r = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `JWT ${jwtToken(credentials.issuer, credentials.secret)}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      // Only the status code: the response body could echo request details.
      throw new Error(`PATCH ${locale} failed with HTTP ${r.status}`);
    }
    patched.push(locale);
    log(`Updated ${locale}.`);
  }
  return { changes, patched };
}

/** The add-on id from manifest.json (browser_specific_settings.gecko.id). */
function addonGuid(root = path.join(__dirname, '..')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  return manifest.browser_specific_settings.gecko.id;
}

if (require.main === module) {
  syncAmo({
    listing: loadListing(),
    guid: addonGuid(),
    fetch: globalThis.fetch,
    apply: process.argv.includes('--apply'),
    credentials: { issuer: process.env.AMO_JWT_ISSUER, secret: process.env.AMO_JWT_SECRET }
  }).catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  amoPayload,
  plainText,
  comparable,
  diffListing,
  jwtToken,
  lineDiff,
  syncAmo,
  addonGuid
};
