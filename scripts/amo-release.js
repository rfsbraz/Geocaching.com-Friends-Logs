#!/usr/bin/env node

/**
 * Sets the AMO (addons.mozilla.org) release notes for a version from CHANGELOG.md
 * and makes the listing previews match store-listing/assets/screenshot-N.png.
 *
 * Usage:
 *   node scripts/amo-release.js [--version 2.5.0]           dry run, prints the plan
 *   node scripts/amo-release.js [--version 2.5.0] --apply   writes to AMO
 *   node scripts/amo-release.js --check-version [--require]  is the version on AMO?
 *
 * --root <dir> reads package.json, CHANGELOG.md and store-listing/assets from another
 * checkout (default: this repo). The release job uses it to run this script from the
 * workflow's commit on the files of an older release tag.
 *
 * --version defaults to package.json. The dry run never writes: it prints the notes
 * payload and the preview diff (read-only GETs). --check-version writes exists=true or
 * exists=false to $GITHUB_OUTPUT; with --require it fails when the version is missing.
 * --apply needs AMO_JWT_ISSUER and AMO_JWT_SECRET, which are never printed.
 *
 * Every AMO request backs off and retries on 429, honouring Retry-After.
 *
 * API: https://mozilla.github.io/addons-server/topics/api/addons.html
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
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
      error.retryAfter = response.headers.get('retry-after') ?? undefined;
      throw error;
    }
    return response.status === 204 ? {} : response.json();
  };
}

/** Retry-After in ms, from seconds or an HTTP date. null when absent or unreadable. */
function retryAfterMs(value, now = Date.now()) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    return Number(text) * 1000;
  }
  const date = Date.parse(text);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Wraps a request function so a 429 waits and retries: Retry-After when AMO sends it,
 * otherwise baseMs doubled each time (capped at maxMs). Other errors pass through.
 */
function withRetry(
  request,
  { sleep = sleepMs, log = console.log, retries = 6, baseMs = 5000, maxMs = 120000 } = {}
) {
  return async (method, url, body) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await request(method, url, body);
      } catch (error) {
        if (error.status !== 429 || attempt > retries) {
          throw error;
        }
        const wait = retryAfterMs(error.retryAfter) ?? Math.min(baseMs * 2 ** (attempt - 1), maxMs);
        log(
          `AMO rate limit on ${method} ${url}, waiting ${Math.ceil(wait / 1000)}s (${attempt}/${retries})`
        );
        await sleep(wait);
      }
    }
  };
}

/** True when AMO has the version (any status the key can see), false on 404. */
async function versionExists(request, version) {
  try {
    await request('GET', `${ADDON_PATH}versions/v${version}/`);
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
}

/** --check-version: writes exists=true|false to the step output; require fails when missing. */
async function checkVersion({ request, version, outputFile, require = false, log = console.log }) {
  const exists = await versionExists(request, version);
  if (outputFile) {
    fs.appendFileSync(outputFile, `exists=${exists}\n`);
  }
  log(exists ? `AMO already has ${version}` : `AMO does not have ${version}`);
  if (require && !exists) {
    throw new Error(`AMO does not have version ${version}`);
  }
  return exists;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/**
 * Decodes an 8-bit, non-interlaced PNG to RGBA. AMO re-encodes uploaded previews, so
 * the bytes differ from the repo file even when the image is the same. Returns null for
 * anything it cannot read, which makes the preview count as different.
 */
function decodePng(buffer) {
  try {
    if (!buffer || buffer.toString('latin1', 1, 4) !== 'PNG') {
      return null;
    }
    let offset = 8;
    let header = null;
    let palette = null;
    let alpha = null;
    const data = [];
    while (offset < buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('latin1', offset + 4, offset + 8);
      const body = buffer.subarray(offset + 8, offset + 8 + length);
      if (type === 'IHDR') {
        header = {
          width: body.readUInt32BE(0),
          height: body.readUInt32BE(4),
          depth: body[8],
          colorType: body[9],
          interlace: body[12]
        };
      } else if (type === 'PLTE') {
        palette = body;
      } else if (type === 'tRNS') {
        alpha = body;
      } else if (type === 'IDAT') {
        data.push(body);
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }
    const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header && header.colorType];
    if (!channels || header.depth !== 8 || header.interlace !== 0) {
      return null;
    }
    const { width, height, colorType } = header;
    const raw = zlib.inflateSync(Buffer.concat(data));
    const stride = width * channels;
    const rgba = Buffer.alloc(width * height * 4);
    let prev = Buffer.alloc(stride);
    for (let y = 0; y < height; y++) {
      const start = y * (stride + 1);
      const filter = raw[start];
      const row = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
      for (let i = 0; i < stride; i++) {
        const left = i >= channels ? row[i - channels] : 0;
        const up = prev[i];
        const upLeft = i >= channels ? prev[i - channels] : 0;
        const add = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
        if (add === undefined) {
          return null;
        }
        row[i] = (row[i] + add) & 0xff;
      }
      for (let x = 0; x < width; x++) {
        const px = row.subarray(x * channels, x * channels + channels);
        const out = (y * width + x) * 4;
        let rgbaPx;
        if (colorType === 0) {
          rgbaPx = [px[0], px[0], px[0], 255];
        } else if (colorType === 4) {
          rgbaPx = [px[0], px[0], px[0], px[1]];
        } else if (colorType === 2) {
          rgbaPx = [px[0], px[1], px[2], 255];
        } else if (colorType === 6) {
          rgbaPx = [px[0], px[1], px[2], px[3]];
        } else {
          const index = px[0];
          rgbaPx = [
            palette[index * 3],
            palette[index * 3 + 1],
            palette[index * 3 + 2],
            alpha && index < alpha.length ? alpha[index] : 255
          ];
        }
        rgba.set(rgbaPx, out);
      }
      prev = row;
    }
    return { width, height, rgba };
  } catch {
    return null;
  }
}

/** sha256 of the decoded pixels and size, so two encodings of one image match. */
function pixelHash(buffer) {
  const image = decodePng(buffer);
  if (!image) {
    return null;
  }
  const size = Buffer.alloc(8);
  size.writeUInt32BE(image.width, 0);
  size.writeUInt32BE(image.height, 4);
  return crypto.createHash('sha256').update(size).update(image.rgba).digest('hex');
}

/**
 * What to change so AMO shows exactly the repo screenshots, in order. desired is
 * [{file, position, hash}], current is [{id, position, hash}]. Each screenshot keeps
 * the first unclaimed AMO preview with the same pixels; the rest of AMO is removed.
 */
function diffPreviews(desired, current) {
  const claimed = new Set();
  const upload = [];
  const move = [];
  for (const want of desired) {
    const match = current.find(
      have => !claimed.has(have.id) && have.hash !== null && have.hash === want.hash
    );
    if (!match) {
      upload.push(want);
      continue;
    }
    claimed.add(match.id);
    if (match.position !== want.position) {
      move.push({ id: match.id, position: want.position });
    }
  }
  const remove = current.filter(have => !claimed.has(have.id)).map(have => have.id);
  return { upload, remove, move };
}

/** Reads the AMO previews and the repo screenshots and diffs them. */
async function previewDiff(plan, { request, fetchImage }) {
  const addon = await request('GET', ADDON_PATH);
  const current = [];
  for (const preview of addon.previews || []) {
    let hash;
    try {
      hash = pixelHash(await fetchImage(preview.image_url));
    } catch {
      hash = null; // unreadable image: treat it as different
    }
    current.push({ id: preview.id, position: preview.position, hash });
  }
  const desired = plan.previews.map(preview => ({
    ...preview,
    hash: pixelHash(fs.readFileSync(preview.path))
  }));
  return diffPreviews(desired, current);
}

/** Public preview image, with the same 429 back-off as the API. */
function publicImageFetcher(options) {
  const get = withRetry(async (method, url) => {
    const response = await fetch(url);
    if (!response.ok) {
      const error = new Error(`GET preview image answered ${response.status}`);
      error.status = response.status;
      error.retryAfter = response.headers.get('retry-after') ?? undefined;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  }, options);
  return url => get('GET', url);
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
 * Sets the release notes, then syncs the previews: uploads the missing screenshots
 * first, then deletes the extras and fixes positions, so the listing is never left
 * without screenshots and a rerun only changes what still differs.
 * The version can take a moment to appear after the upload, so a 404 is retried.
 */
async function applyPlan(
  plan,
  { request, fetchImage = publicImageFetcher(), log = console.log, retries = 10, waitMs = 30000 }
) {
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
      await sleepMs(waitMs);
    }
  }
  log(`Release notes set for ${plan.version}`);

  const diff = await previewDiff(plan, { request, fetchImage });
  for (const preview of diff.upload) {
    await request('POST', `${ADDON_PATH}previews/`, previewForm(preview));
    log(`Uploaded preview ${preview.file} at position ${preview.position}`);
  }
  for (const id of diff.remove) {
    await request('DELETE', `${ADDON_PATH}previews/${id}/`);
    log(`Deleted preview ${id}, not in the repo`);
  }
  for (const { id, position } of diff.move) {
    await request('PATCH', `${ADDON_PATH}previews/${id}/`, { position });
    log(`Moved preview ${id} to position ${position}`);
  }
  if (!diff.upload.length && !diff.remove.length && !diff.move.length) {
    log('Previews already match the repo');
  }
}

function parseArgs(argv) {
  const args = { apply: false, checkVersion: false, require: false, version: null, root: ROOT_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') {
      args.apply = true;
    } else if (argv[i] === '--check-version') {
      args.checkVersion = true;
    } else if (argv[i] === '--require') {
      args.require = true;
    } else if (argv[i] === '--version') {
      args.version = argv[++i];
    } else if (argv[i] === '--root') {
      args.root = path.resolve(argv[++i]);
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

/** Unauthenticated GET of the public API, for dry runs without the AMO key. */
async function publicRequest(method, url) {
  const response = await fetch(API_BASE + url);
  if (!response.ok) {
    const error = new Error(`AMO ${method} ${url} answered ${response.status}`);
    error.status = response.status;
    error.retryAfter = response.headers.get('retry-after') ?? undefined;
    throw error;
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const version =
    args.version ||
    JSON.parse(fs.readFileSync(path.join(args.root, 'package.json'), 'utf8')).version;
  const { AMO_JWT_ISSUER: issuer, AMO_JWT_SECRET: secret } = process.env;
  const signed = issuer && secret ? withRetry(amoClient(issuer, secret)) : null;

  if (args.checkVersion) {
    // With the key this also sees versions still awaiting review; without it, public only.
    await checkVersion({
      request: signed || withRetry(publicRequest),
      version,
      outputFile: process.env.GITHUB_OUTPUT,
      require: args.require
    });
    return;
  }

  const plan = buildPlan({
    changelog: fs.readFileSync(path.join(args.root, 'CHANGELOG.md'), 'utf8'),
    version,
    assetsDir: path.join(args.root, 'store-listing', 'assets')
  });

  if (args.apply) {
    if (!signed) {
      throw new Error('--apply needs AMO_JWT_ISSUER and AMO_JWT_SECRET');
    }
    await applyPlan(plan, { request: signed });
    return;
  }

  console.log(`Dry run for ${plan.addon}, nothing is sent.\n`);
  console.log(`PATCH ${API_BASE}${ADDON_PATH}versions/v${plan.version}/`);
  console.log(JSON.stringify(plan.notesPayload, null, 2));
  // Read-only. The listing and preview images are public, so this works without the key.
  const diff = await previewDiff(plan, {
    request: signed || withRetry(publicRequest),
    fetchImage: publicImageFetcher()
  });
  console.log('\nPreview sync:');
  for (const preview of diff.upload) {
    const size = fs.statSync(preview.path).size;
    console.log(`  POST previews/  position=${preview.position}  ${preview.file}  ${size} bytes`);
  }
  for (const id of diff.remove) {
    console.log(`  DELETE previews/${id}/`);
  }
  for (const { id, position } of diff.move) {
    console.log(`  PATCH previews/${id}/  position=${position}`);
  }
  if (!diff.upload.length && !diff.remove.length && !diff.move.length) {
    console.log('  nothing, AMO already matches the repo');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(`::error title=AMO::${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  listPreviews,
  buildPlan,
  makeJwt,
  applyPlan,
  parseArgs,
  withRetry,
  retryAfterMs,
  versionExists,
  checkVersion,
  decodePng,
  pixelHash,
  diffPreviews,
  ADDON_GUID
};
