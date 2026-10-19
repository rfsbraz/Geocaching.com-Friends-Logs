/**
 * @jest-environment node
 */
const crypto = require('crypto');
const {
  amoPayload,
  plainText,
  diffListing,
  jwtToken,
  syncAmo
} = require('../../scripts/amo-listing');

const GUID = 'made-up@example.invalid';

// A made-up listing in the store-listing format (#112).
function listing() {
  return {
    config: { defaultLocale: 'en', locales: ['en', 'sv'] },
    locales: {
      en: {
        storeLocales: { firefox: 'en-US' },
        summary: 'A made-up summary.',
        description: ['First line on example.com.', '', 'Second line.']
      },
      sv: {
        storeLocales: { firefox: 'sv-SE' },
        summary: 'En påhittad sammanfattning.',
        description: ['Första raden.']
      }
    }
  };
}

// What the public AMO API returns: every translation, links wrapped, HTML escaped.
function liveAddon() {
  return {
    summary: {
      'en-US': 'A made-up summary.',
      'sv-SE': 'En gammal sammanfattning.',
      'pt-PT': 'Old'
    },
    description: {
      'en-US':
        'First line on <a href="https://outgoing.example/v1/abc/http%3A//example.com" rel="nofollow">example.com</a>.\n\nSecond line.',
      'sv-SE': 'Första raden.',
      'pt-PT': 'Old'
    }
  };
}

function fakeFetch(addon) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body });
    if ((init.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => addon };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  fn.calls = calls;
  return fn;
}

describe('AMO listing sync (#113)', () => {
  test('builds the payload from storeLocales.firefox and the joined description', () => {
    expect(amoPayload(listing())).toEqual({
      'en-US': {
        summary: 'A made-up summary.',
        description: 'First line on example.com.\n\nSecond line.'
      },
      'sv-SE': { summary: 'En påhittad sammanfattning.', description: 'Första raden.' }
    });
  });

  test('plainText removes AMO link wrapping and HTML escaping', () => {
    expect(plainText('a <a href="https://x/y" rel="nofollow">b.com</a> &gt; c &#39;d&#39;')).toBe(
      "a b.com > c 'd'"
    );
  });

  test('diff reports only real text changes, per locale and field', () => {
    const changes = diffListing(amoPayload(listing()), liveAddon());
    expect(changes).toEqual([
      {
        locale: 'sv-SE',
        field: 'summary',
        live: 'En gammal sammanfattning.',
        source: 'En påhittad sammanfattning.'
      }
    ]);
  });

  test('a dry run reads the public API and never writes', async () => {
    const fetch = fakeFetch(liveAddon());
    const result = await syncAmo({
      listing: listing(),
      guid: GUID,
      fetch,
      apply: false,
      log: () => {}
    });
    expect(result.changes).toHaveLength(1);
    expect(result.patched).toEqual([]);
    expect(fetch.calls.map(c => c.method)).toEqual(['GET']);
    expect(fetch.calls[0].headers.Authorization).toBeUndefined();
    expect(fetch.calls[0].url).toBe(
      'https://addons.mozilla.org/api/v5/addons/addon/made-up%40example.invalid/'
    );
  });

  test('apply sends one authenticated PATCH per changed locale', async () => {
    const fetch = fakeFetch(liveAddon());
    const result = await syncAmo({
      listing: listing(),
      guid: GUID,
      fetch,
      apply: true,
      credentials: { issuer: 'user:1:2', secret: 'made-up-secret' },
      log: () => {}
    });
    expect(result.patched).toEqual(['sv-SE']);
    const patches = fetch.calls.filter(c => c.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe(fetch.calls[0].url);
    expect(patches[0].headers.Authorization).toMatch(/^JWT [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(patches[0].body)).toEqual({
      summary: { 'sv-SE': 'En påhittad sammanfattning.' },
      description: { 'sv-SE': 'Första raden.' }
    });
  });

  test('apply without credentials fails before any write', async () => {
    const fetch = fakeFetch(liveAddon());
    await expect(
      syncAmo({
        listing: listing(),
        guid: GUID,
        fetch,
        apply: true,
        credentials: {},
        log: () => {}
      })
    ).rejects.toThrow('AMO_JWT_ISSUER and AMO_JWT_SECRET are required');
    expect(fetch.calls.filter(c => c.method === 'PATCH')).toEqual([]);
  });

  test('the JWT is HS256 with iss, jti, iat and a short exp', () => {
    const token = jwtToken('user:1:2', 'made-up-secret', 1700000000);
    const [h, p, s] = token.split('.');
    const decode = part => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    expect(decode(h)).toEqual({ alg: 'HS256', typ: 'JWT' });
    const payload = decode(p);
    expect(payload).toMatchObject({ iss: 'user:1:2', iat: 1700000000, exp: 1700000060 });
    expect(payload.jti).toMatch(/^[0-9a-f]{32}$/);
    const expected = crypto
      .createHmac('sha256', 'made-up-secret')
      .update(`${h}.${p}`)
      .digest('base64url');
    expect(s).toBe(expected);
  });
});
