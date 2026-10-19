/**
 * @jest-environment node
 */
const path = require('path');
const { loadListing } = require('../../scripts/store-listing');
const {
  expectedFor,
  parseChromePage,
  parseEdgeDetails,
  findDrift,
  renderIssue,
  checkStores
} = require('../../scripts/store-drift');

const root = path.join(__dirname, '..', '..');

// A made-up listing in the store-listing format (#112).
function listing() {
  return {
    config: {
      defaultLocale: 'en',
      locales: ['en', 'sv'],
      storeIds: { chrome: 'chromeid', edge: 'edgeid', firefox: 'made-up@example.invalid' }
    },
    locales: {
      en: {
        language: 'English',
        extensionLocale: 'en',
        storeLocales: { chrome: 'en', edge: 'en-US', firefox: 'en-US' },
        summary: 'A made-up summary.',
        description: ['First line.', '', 'Second line.']
      },
      sv: {
        language: 'Swedish (Svenska)',
        extensionLocale: 'sv',
        storeLocales: { chrome: 'sv', edge: 'sv-SE', firefox: 'sv-SE' },
        summary: 'En påhittad sammanfattning.',
        description: ['Första raden.']
      }
    }
  };
}

const chromePage = (lang, summary, description) =>
  `<html lang="${lang}" dir="ltr"><head><meta name="description" content="${summary}"></head>` +
  `<body><div jsname="ij8cu" class="x"><p>${summary}</p><p>${description}</p></div></body></html>`;

describe('store listing drift check (#115)', () => {
  test('Edge codes in the source are region tags, because Edge reads fr as fr-CA', () => {
    const { locales } = loadListing(root);
    for (const l of Object.values(locales)) {
      expect(l.storeLocales.edge).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
    }
    expect(locales.fr.storeLocales.edge).toBe('fr-FR');
  });

  test('the source names each store item to check', () => {
    expect(Object.keys(loadListing(root).config.storeIds).sort()).toEqual([
      'chrome',
      'edge',
      'firefox'
    ]);
  });

  test('Chrome and Edge expect the default summary until the package ships the language', () => {
    const shipped = new Set(['en']);
    expect(expectedFor(listing(), 'chrome', shipped).map(e => e.summary)).toEqual([
      'A made-up summary.',
      'A made-up summary.'
    ]);
    expect(expectedFor(listing(), 'firefox', shipped).map(e => e.summary)).toEqual([
      'A made-up summary.',
      'En påhittad sammanfattning.'
    ]);
    expect(expectedFor(listing(), 'edge', new Set(['en', 'sv']))[1]).toMatchObject({
      code: 'sv-SE',
      summary: 'En påhittad sammanfattning.',
      description: 'Första raden.'
    });
  });

  test('parses the public Chrome page', () => {
    const page = chromePage('sv', 'Sammanfattning &amp; mer', 'Rad ett.\n\n  Rad två.');
    expect(parseChromePage(page)).toEqual({
      locale: 'sv',
      summary: 'Sammanfattning & mer',
      description: 'Rad ett.\n\n  Rad två.'
    });
  });

  test('parses the public Edge product details', () => {
    expect(
      parseEdgeDetails({ locale: 'sv-SE', shortDescription: 'Kort', description: 'Lång' })
    ).toEqual({ locale: 'sv-SE', summary: 'Kort', description: 'Lång' });
  });

  test('reports drift per language, ignoring whitespace the stores add', () => {
    const expected = expectedFor(listing(), 'chrome', new Set(['en']));
    const live = {
      en: {
        locale: 'en',
        summary: 'A made-up summary.',
        description: 'First line.\n\n  Second line.'
      },
      sv: {
        locale: 'sv',
        summary: 'A made-up summary.',
        description: 'First line.\n\nSecond line.'
      }
    };
    const drift = findDrift(expected, live);
    expect(drift.map(d => [d.code, d.fields])).toEqual([['sv', ['description']]]);
  });

  test('a store that ignored the language code is reported', () => {
    const expected = expectedFor(listing(), 'edge', new Set(['en']));
    const live = {
      en: {
        locale: 'en-US',
        summary: 'A made-up summary.',
        description: 'First line.\n\nSecond line.'
      },
      sv: { locale: 'en-US', summary: 'A made-up summary.', description: 'Första raden.' }
    };
    expect(findDrift(expected, live).map(d => [d.code, d.fields])).toEqual([['sv-SE', ['locale']]]);
  });

  test('the issue body carries the exact text to paste', () => {
    const expected = expectedFor(listing(), 'chrome', new Set(['en', 'sv']));
    const live = {
      en: {
        locale: 'en',
        summary: 'A made-up summary.',
        description: 'First line.\n\nSecond line.'
      },
      sv: { locale: 'sv', summary: 'Gammal.', description: 'Gammal text.' }
    };
    const body = renderIssue('chrome', findDrift(expected, live));
    expect(body).toContain('### Swedish (Svenska), `sv`');
    expect(body).toContain('```text\nFörsta raden.\n```');
    expect(body).toContain('_locales/sv/messages.json');
    expect(body).not.toContain('First line.');
  });

  test('checkStores reads public pages only, without cookies or auth', async () => {
    const calls = [];
    const fetch = async (url, init = {}) => {
      calls.push({ url, headers: init.headers || {} });
      if (url.includes('chromewebstore')) {
        const hl = new URL(url).searchParams.get('hl');
        const text =
          hl === 'en' ? ['A made-up summary.', 'First line.\n\nSecond line.'] : ['Old', 'Old'];
        return { ok: true, status: 200, text: async () => chromePage(hl, ...text) };
      }
      if (url.includes('microsoftedge')) {
        const hl = new URL(url).searchParams.get('hl');
        return {
          ok: true,
          status: 200,
          json: async () => ({
            locale: hl,
            shortDescription: 'A made-up summary.',
            description: hl === 'en-US' ? 'First line.\n\nSecond line.' : 'Första raden.'
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          summary: { 'en-US': 'A made-up summary.', 'sv-SE': 'En påhittad sammanfattning.' },
          description: { 'en-US': 'First line.\n\nSecond line.', 'sv-SE': 'Första raden.' }
        })
      };
    };
    const result = await checkStores({ listing: listing(), shipped: new Set(['en']), fetch });
    expect(result.chrome.status).toBe('drift');
    expect(result.chrome.drift.map(d => d.code)).toEqual(['sv']);
    expect(result.edge.status).toBe('clean');
    expect(result.firefox.status).toBe('clean');
    expect(calls).toHaveLength(5);
    for (const c of calls) {
      expect(c.headers.Cookie).toBeUndefined();
      expect(c.headers.Authorization).toBeUndefined();
    }
  });

  test('a page that cannot be read is an error, not a clean result', async () => {
    const fetch = async () => ({ ok: false, status: 503 });
    const result = await checkStores({ listing: listing(), shipped: new Set(['en']), fetch });
    expect(result.chrome.status).toBe('error');
    expect(result.chrome.errors[0]).toMatch(/HTTP 503/);
  });
});
