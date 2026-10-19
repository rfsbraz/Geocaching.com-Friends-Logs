#!/usr/bin/env node

/**
 * Sets the AMO (addons.mozilla.org) release notes for a version from CHANGELOG.md
 * and replaces the listing previews with store-listing/assets/screenshot-N.png.
 *
 * Usage:
 *   node scripts/amo-release.js [--version 2.5.0]           dry run, prints the plan
 *   node scripts/amo-release.js [--version 2.5.0] --apply   writes to AMO
 *
 * --version defaults to package.json. The dry run never writes: it prints the notes
 * payload, the previews to upload and the current previews it would delete (a
 * read-only GET). --apply needs AMO_JWT_ISSUER and AMO_JWT_SECRET, which are never
 * printed.
 *
 * API: https://mozilla.github.io/addons-server/topics/api/addons.html
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { releaseNotes } = require('./changelog');

const ROOT_DIR = path.join(__dirname, '..');
const ADDON_GUID = 'geocaching-friends-logs@rfsbraz.github.io';
const API_BASE = 'https://addons.mozilla.org/api/v5/';
const ADDON_PATH = `addons/addon/${ADDON_GUID}/`;

/** store-listing/assets/screenshot-N.png in numeric order, with their AMO positions. */
function listPreviews(assetsDir) {
  return fs
    .readdirSync(assetsDir)
    .map(file => ({ file, match: file.match(/^screenshot-(\d+)\.png$/) }))
    .filter(entry => entry.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]))
    .map((entry, position) => ({
      file: entry.file,
      path: path.join(assetsDir, entry.file),
      position
    }));
}

function buildPlan({ changelog, version, assetsDir }) {
  const notes = releaseNotes(changelog, version);
  const previews = listPreviews(assetsDir);
  if (!previews.length) {
    throw new Error(`No screenshot-N.png files in ${assetsDir}`);
  }
  return {
    addon: ADDON_GUID,
    version,
    notesPayload: { release_notes: { 'en-US': notes } },
    previews
  };
}

/** HS256 JWT for the AMO API. One per request, valid for 60 seconds. */
function makeJwt(issuer, secret, now = Math.floor(Date.now() / 1000), jti = crypto.randomUUID()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: issuer, jti, iat: now, exp: now + 60 })}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

/** Real API client. Error messages carry the status and URL only, never the request. */
function amoClient(issuer, secret) {
  return async (method, url, body) => {
    const headers = { Authorization: `JWT ${makeJwt(issuer, secret)}` };
    let payload;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const response = await fetch(API_BASE + url, { method, headers, body: payload });
    if (!response.ok) {
      const error = new Error(`AMO ${method} ${url} answered ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.status === 204 ? {} : response.json();
  };
}

function previewForm(preview) {
  const form = new FormData();
  form.append(
    'image',
    new Blob([fs.readFileSync(preview.path)], { type: 'image/png' }),
    preview.file
  );
  form.append('position', String(preview.position));
  return form;
}

/**
 * Sets the release notes, uploads every preview, and only then deletes the previews
 * that were there before, so the listing is never left without screenshots.
 * The version can take a moment to appear after the upload, so a 404 is retried.
 */
async function applyPlan(plan, { request, log = console.log, retries = 10, waitMs = 30000 }) {
  const versionUrl = `${ADDON_PATH}versions/v${plan.version}/`;
  for (let attempt = 1; ; attempt++) {
    try {
      await request('PATCH', versionUrl, plan.notesPayload);
      break;
    } catch (error) {
      if (error.status !== 404 || attempt >= retries) {
        throw error;
      }
      log(`Version ${plan.version} not on AMO yet, retrying (${attempt}/${retries})`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
  log(`Release notes set for ${plan.version}`);

  const addon = await request('GET', ADDON_PATH);
  const old = (addon.previews || []).map(preview => preview.id);
  for (const preview of plan.previews) {
    await request('POST', `${ADDON_PATH}previews/`, previewForm(preview));
    log(`Uploaded preview ${preview.file} at position ${preview.position}`);
  }
  for (const id of old) {
    await request('DELETE', `${ADDON_PATH}previews/${id}/`);
    log(`Deleted old preview ${id}`);
  }
}

function parseArgs(argv) {
  const args = { apply: false, version: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') {
      args.apply = true;
    } else if (argv[i] === '--version') {
      args.version = argv[++i];
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version =
    args.version ||
    JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version;
  const plan = buildPlan({
    changelog: fs.readFileSync(path.join(ROOT_DIR, 'CHANGELOG.md'), 'utf8'),
    version,
    assetsDir: path.join(ROOT_DIR, 'store-listing', 'assets')
  });
  const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
  const request = issuer && secret ? amoClient(issuer, secret) : null;

  if (args.apply) {
    if (!request) {
      throw new Error('--apply needs AMO_JWT_ISSUER and AMO_JWT_SECRET');
    }
    await applyPlan(plan, { request });
    return;
  }

  console.log(`Dry run for ${plan.addon}, nothing is sent.\n`);
  console.log(`PATCH ${API_BASE}${ADDON_PATH}versions/v${plan.version}/`);
  console.log(JSON.stringify(plan.notesPayload, null, 2));
  console.log('\nPreviews to upload (multipart image + position):');
  for (const preview of plan.previews) {
    const size = fs.statSync(preview.path).size;
    console.log(`  POST previews/  position=${preview.position}  ${preview.file}  ${size} bytes`);
  }
  // Read-only. The listing is public, so this works without credentials too.
  const addon = request
    ? await request('GET', ADDON_PATH)
    : await fetch(API_BASE + ADDON_PATH).then(response => response.json());
  const old = (addon.previews || []).map(preview => preview.id);
  console.log(`\nThen DELETE the previews on AMO now: ${old.length ? old.join(', ') : 'none'}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`::error title=AMO::${error.message}`);
    process.exit(1);
  });
}

module.exports = { listPreviews, buildPlan, makeJwt, applyPlan, ADDON_GUID };
