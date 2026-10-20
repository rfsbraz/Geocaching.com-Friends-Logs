const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const amo = require('../../scripts/amo-release');

// Firefox publish rerun and rate limits (#147). In the v2.5.0 release AMO answered 429
// on a preview delete halfway through the sync, and the rerun then failed at the
// upload with 409 "Version 2.5.0 already exists", leaving AMO with 2 previews for 1
// repo screenshot.

const ROOT = path.join(__dirname, '..', '..');
const ADDON = 'addons/addon/geocaching-friends-logs@rfsbraz.github.io/';
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const changelog = '## [2.5.0](x) (2026-10-20)\n\n### Bug Fixes\n\n* **ui:** a fix ([#1](u))\n';

// Minimal PNG encoder: 8-bit RGB (colorType 2) or RGBA (6), one filter type for all rows.
function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(width, height, rgba, { colorType = 6, filter = 0 } = {}) {
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = [];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(stride);
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < channels; c++) {
        row[x * channels + c] = rgba[(y * width + x) * 4 + c];
      }
    }
    const out = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      out[i] = filter === 1 ? row[i] - left : filter === 2 ? row[i] - prev[i] : row[i];
    }
    raw.push(Buffer.from([filter]), out);
    prev = row;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(raw))),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
function pixels(seed, width = 4, height = 3) {
  const out = [];
  for (let i = 0; i < width * height; i++) {
    out.push((seed * 31 + i * 7) % 256, (seed * 17 + i * 3) % 256, (seed + i) % 256, 255);
  }
  return out;
}
const imageA = encodePng(4, 3, pixels(1));
const imageB = encodePng(4, 3, pixels(2));

function assetsWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-rerun-'));
  for (const [name, data] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), data);
  }
  return dir;
}

function httpError(status, retryAfter) {
  const error = new Error(`AMO answered ${status}`);
  error.status = status;
  if (retryAfter !== undefined) {
    error.retryAfter = retryAfter;
  }
  return error;
}

describe('429 back-off and retry (#147)', () => {
  test('retries a 429 and waits for Retry-After seconds', async () => {
    const waits = [];
    let calls = 0;
    const request = async () => {
      calls++;
      if (calls === 1) {
        throw httpError(429, '3');
      }
      return { ok: true };
    };
    const wrapped = amo.withRetry(request, { sleep: async ms => waits.push(ms), log: () => {} });
    await expect(wrapped('DELETE', `${ADDON}previews/349679/`)).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
    expect(waits).toEqual([3000]);
  });

  test('Retry-After as an HTTP date waits until that time', () => {
    const now = Date.parse('2026-10-20T08:38:09Z');
    expect(amo.retryAfterMs('Tue, 20 Oct 2026 08:38:19 GMT', now)).toBe(10000);
    expect(amo.retryAfterMs('7', now)).toBe(7000);
    expect(amo.retryAfterMs(undefined, now)).toBeNull();
    expect(amo.retryAfterMs('soon', now)).toBeNull();
  });

  test('without Retry-After it backs off exponentially', async () => {
    const waits = [];
    let calls = 0;
    const request = async () => {
      if (++calls <= 3) {
        throw httpError(429);
      }
      return {};
    };
    const wrapped = amo.withRetry(request, {
      sleep: async ms => waits.push(ms),
      log: () => {},
      baseMs: 1000
    });
    await wrapped('GET', ADDON);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  test('gives up after the retry budget and rethrows the 429', async () => {
    const request = async () => {
      throw httpError(429, '1');
    };
    const wrapped = amo.withRetry(request, { sleep: async () => {}, log: () => {}, retries: 3 });
    await expect(wrapped('GET', ADDON)).rejects.toMatchObject({ status: 429 });
  });

  test('other errors are not retried', async () => {
    let calls = 0;
    const request = async () => {
      calls++;
      throw httpError(400);
    };
    const wrapped = amo.withRetry(request, { sleep: async () => {}, log: () => {} });
    await expect(wrapped('GET', ADDON)).rejects.toMatchObject({ status: 400 });
    expect(calls).toBe(1);
  });
});

describe('rerun for a version AMO already has (#147)', () => {
  test('versionExists is true when AMO has the version, false on 404', async () => {
    const seen = [];
    const has = async (method, url) => {
      seen.push(`${method} ${url}`);
      return { version: '2.5.0' };
    };
    const missing = async () => {
      throw httpError(404);
    };
    await expect(amo.versionExists(has, '2.5.0')).resolves.toBe(true);
    expect(seen).toEqual([`GET ${ADDON}versions/v2.5.0/`]);
    await expect(amo.versionExists(missing, '2.5.0')).resolves.toBe(false);
    await expect(
      amo.versionExists(async () => {
        throw httpError(500);
      }, '2.5.0')
    ).rejects.toMatchObject({ status: 500 });
  });

  test('--check-version writes exists=true|false to GITHUB_OUTPUT', async () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gho-')), 'output');
    await amo.checkVersion({ request: async () => ({}), version: '2.5.0', outputFile: out });
    expect(fs.readFileSync(out, 'utf8')).toBe('exists=true\n');
    await expect(
      amo.checkVersion({
        request: async () => {
          throw httpError(404);
        },
        version: '2.5.1',
        outputFile: out,
        require: true
      })
    ).rejects.toThrow(/2\.5\.1/);
  });

  // Steps of the publish-to-firefox job, split on "      - name:".
  function firefoxSteps() {
    const start = workflow.indexOf('\n  publish-to-firefox:\n');
    const end = workflow.indexOf('\n  publish-to-edge:\n');
    return workflow
      .slice(start, end)
      .split(/\n(?= {6}- name:)/)
      .slice(1);
  }
  const step = name => firefoxSteps().find(s => s.includes(`- name: ${name}`));

  test('the job checks AMO for the version before uploading', () => {
    const names = firefoxSteps().map(s => s.match(/- name: (.*)/)[1]);
    const check = names.indexOf('Check whether AMO already has this version');
    const upload = names.indexOf('Upload to Firefox Add-ons');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(upload);
    expect(step('Check whether AMO already has this version')).toMatch(/id: amo-version/);
    expect(step('Check whether AMO already has this version')).toMatch(
      /node scripts\/amo-release\.js --check-version/
    );
  });

  test('the upload is skipped when AMO has the version, and a failed upload (409) is tolerated', () => {
    const upload = step('Upload to Firefox Add-ons');
    expect(upload).toMatch(/if: steps\.amo-version\.outputs\.exists != 'true'/);
    expect(upload).toMatch(/id: upload/);
    expect(upload).toMatch(/continue-on-error: true/);
    const confirm = step('Confirm AMO has this version');
    expect(confirm).toMatch(/if: steps\.upload\.outcome == 'failure'/);
    expect(confirm).toMatch(/--check-version --require/);
  });

  test('notes and previews still run on a rerun', () => {
    expect(step('Set AMO release notes and previews')).not.toMatch(/\n {8}if:/);
  });
});

describe('preview sync makes AMO match the repo (#147)', () => {
  test('pixelHash ignores how the PNG is encoded but not what it shows', () => {
    const rgb = encodePng(4, 3, pixels(1), { colorType: 2, filter: 1 });
    const up = encodePng(4, 3, pixels(1), { colorType: 6, filter: 2 });
    expect(amo.pixelHash(imageA)).toBeTruthy();
    expect(amo.pixelHash(rgb)).toBe(amo.pixelHash(imageA));
    expect(amo.pixelHash(up)).toBe(amo.pixelHash(imageA));
    expect(amo.pixelHash(imageB)).not.toBe(amo.pixelHash(imageA));
    expect(amo.pixelHash(Buffer.from('not a png'))).toBeNull();
  });

  test('the repo screenshots decode', () => {
    const dir = path.join(ROOT, 'store-listing', 'assets');
    for (const preview of amo.listPreviews(dir)) {
      expect(amo.pixelHash(fs.readFileSync(preview.path))).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  test('diff keeps matches, uploads the missing, deletes the extras, fixes positions', () => {
    const diff = amo.diffPreviews(
      [
        { file: 'screenshot-1.png', position: 0, hash: 'a' },
        { file: 'screenshot-2.png', position: 1, hash: 'b' },
        { file: 'screenshot-3.png', position: 2, hash: 'c' }
      ],
      [
        { id: 10, position: 0, hash: 'x' },
        { id: 11, position: 0, hash: 'b' },
        { id: 12, position: 1, hash: 'a' },
        { id: 13, position: 2, hash: 'a' },
        { id: 14, position: 3, hash: null }
      ]
    );
    expect(diff.upload.map(p => p.file)).toEqual(['screenshot-3.png']);
    expect(diff.remove).toEqual([10, 13, 14]);
    expect(diff.move).toEqual([
      { id: 12, position: 0 },
      { id: 11, position: 1 }
    ]);
  });

  test('the 2.5.0 state: deletes the stale preview and uploads nothing', async () => {
    const plan = amo.buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: assetsWith({ 'screenshot-1.png': imageA })
    });
    const images = {
      'https://amo/349679.png': imageB,
      'https://amo/430259.png': encodePng(4, 3, pixels(1), { colorType: 2 })
    };
    const calls = [];
    const request = async (method, url) => {
      calls.push(`${method} ${url}`);
      if (method === 'GET') {
        return {
          previews: [
            { id: 349679, position: 0, image_url: 'https://amo/349679.png' },
            { id: 430259, position: 0, image_url: 'https://amo/430259.png' }
          ]
        };
      }
      return {};
    };
    await amo.applyPlan(plan, { request, fetchImage: async url => images[url], log: () => {} });
    expect(calls).toEqual([
      `PATCH ${ADDON}versions/v2.5.0/`,
      `GET ${ADDON}`,
      `DELETE ${ADDON}previews/349679/`
    ]);
  });

  test('missing previews are uploaded before the extras are deleted', async () => {
    const plan = amo.buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: assetsWith({ 'screenshot-1.png': imageA, 'screenshot-2.png': imageB })
    });
    const calls = [];
    const request = async (method, url) => {
      calls.push(`${method} ${url}`);
      if (method === 'GET') {
        return { previews: [{ id: 7, position: 0, image_url: 'u7' }] };
      }
      return method === 'POST' ? { id: 100 + calls.length } : {};
    };
    await amo.applyPlan(plan, {
      request,
      fetchImage: async () => Buffer.from('old'),
      log: () => {}
    });
    expect(calls).toEqual([
      `PATCH ${ADDON}versions/v2.5.0/`,
      `GET ${ADDON}`,
      `POST ${ADDON}previews/`,
      `POST ${ADDON}previews/`,
      `DELETE ${ADDON}previews/7/`
    ]);
  });

  test('a rerun when AMO already matches changes nothing', async () => {
    const plan = amo.buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: assetsWith({ 'screenshot-1.png': imageA })
    });
    const calls = [];
    const request = async (method, url) => {
      calls.push(`${method} ${url}`);
      return method === 'GET' ? { previews: [{ id: 5, position: 0, image_url: 'u5' }] } : {};
    };
    await amo.applyPlan(plan, { request, fetchImage: async () => imageA, log: () => {} });
    expect(calls).toEqual([`PATCH ${ADDON}versions/v2.5.0/`, `GET ${ADDON}`]);
  });
});
