const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listPreviews, buildPlan, makeJwt, applyPlan } = require('../../scripts/amo-release');

const ROOT = path.join(__dirname, '..', '..');
const changelog =
  '## [2.5.0](x) (2026-10-20)\n\n### Features\n\n* **ui:** a thing ([#1](u)) ([abcdef1](c))\n';

function fakeAssets(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-assets-'));
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), 'png');
  }
  return dir;
}

function recorder(existing) {
  const calls = [];
  const request = async (method, url, body) => {
    calls.push({ method, url, body });
    if (method === 'GET') {
      return { previews: existing.map(id => ({ id })) };
    }
    if (method === 'POST') {
      return { id: 1000 + calls.length };
    }
    return {};
  };
  return { calls, request };
}

describe('AMO release notes and previews (#114)', () => {
  test('previews are the screenshot-N.png files in numeric order, nothing else', () => {
    const dir = fakeAssets([
      'screenshot-10.png',
      'screenshot-2.png',
      'screenshot-1.png',
      'icon128.png',
      'promo_small_440x280.png'
    ]);
    expect(listPreviews(dir).map(p => p.file)).toEqual([
      'screenshot-1.png',
      'screenshot-2.png',
      'screenshot-10.png'
    ]);
    expect(listPreviews(dir).map(p => p.position)).toEqual([0, 1, 2]);
  });

  test('the repo ships at least one AMO preview', () => {
    expect(listPreviews(path.join(ROOT, 'store-listing', 'assets')).length).toBeGreaterThan(0);
  });

  test('plan carries the CHANGELOG section as en-US release notes for v<version>', () => {
    const plan = buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: fakeAssets(['screenshot-1.png'])
    });
    expect(plan.version).toBe('2.5.0');
    expect(plan.notesPayload).toEqual({
      release_notes: { 'en-US': 'Features\n- ui: a thing (#1)' }
    });
    expect(plan.previews.map(p => p.file)).toEqual(['screenshot-1.png']);
  });

  test('plan fails when CHANGELOG.md has no section for the version', () => {
    expect(() => buildPlan({ changelog, version: '9.9.9', assetsDir: fakeAssets([]) })).toThrow(
      /9\.9\.9/
    );
  });

  test('plan fails when there are no screenshots to upload', () => {
    expect(() =>
      buildPlan({ changelog, version: '2.5.0', assetsDir: fakeAssets(['icon128.png']) })
    ).toThrow(/screenshot/);
  });

  test('makeJwt signs an HS256 token AMO accepts', () => {
    const token = makeJwt('user:1:2', 'shh', 1700000000, 'abc');
    const [h, p, s] = token.split('.');
    const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString());
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(decode(p)).toEqual({ iss: 'user:1:2', jti: 'abc', iat: 1700000000, exp: 1700000060 });
    const expected = crypto.createHmac('sha256', 'shh').update(`${h}.${p}`).digest('base64url');
    expect(s).toBe(expected);
  });

  test('apply sets notes, uploads new previews, then deletes the old ones', async () => {
    const plan = buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: fakeAssets(['screenshot-1.png', 'screenshot-2.png'])
    });
    const { calls, request } = recorder([7, 8]);
    await applyPlan(plan, { request, log: () => {} });
    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      'PATCH addons/addon/geocaching-friends-logs@rfsbraz.github.io/versions/v2.5.0/',
      'GET addons/addon/geocaching-friends-logs@rfsbraz.github.io/',
      'POST addons/addon/geocaching-friends-logs@rfsbraz.github.io/previews/',
      'POST addons/addon/geocaching-friends-logs@rfsbraz.github.io/previews/',
      'DELETE addons/addon/geocaching-friends-logs@rfsbraz.github.io/previews/7/',
      'DELETE addons/addon/geocaching-friends-logs@rfsbraz.github.io/previews/8/'
    ]);
    expect(calls[0].body).toEqual(plan.notesPayload);
  });

  test('apply keeps the old previews when an upload fails', async () => {
    const plan = buildPlan({
      changelog,
      version: '2.5.0',
      assetsDir: fakeAssets(['screenshot-1.png'])
    });
    const { calls, request: base } = recorder([7]);
    const request = async (method, url, body) => {
      if (method === 'POST') {
        throw new Error('upload rejected');
      }
      return base(method, url, body);
    };
    await expect(applyPlan(plan, { request, log: () => {} })).rejects.toThrow(/upload rejected/);
    expect(calls.some(c => c.method === 'DELETE')).toBe(false);
  });
});
