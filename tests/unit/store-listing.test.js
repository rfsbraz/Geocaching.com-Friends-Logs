/**
 * @jest-environment node
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadListing, validateListing, renderChromeUpdate } = require('../../scripts/store-listing');

const root = path.join(__dirname, '..', '..');
const localesDir = path.join(root, '_locales');

// A small, valid listing used to check that the validator catches each problem.
function sample() {
  return {
    config: {
      name: 'Sample Extension',
      defaultLocale: 'en',
      locales: ['en'],
      stores: ['chrome', 'edge', 'firefox'],
      limits: {
        chrome: { name: { max: 75 }, summary: { max: 132 }, description: { max: 16000 } },
        edge: { summary: { max: 132 }, description: { min: 250, max: 10000 } },
        firefox: { name: { max: 50 }, summary: { max: 250 } }
      }
    },
    locales: {
      en: {
        language: 'English',
        extensionLocale: 'en',
        storeLocales: { chrome: 'en', edge: 'en', firefox: 'en-US' },
        summary: 'A made-up summary.',
        description: ['A made-up description.', '', 'x'.repeat(300)],
        screenshots: ['screenshot-1.png']
      }
    }
  };
}

// A throwaway _locales folder with one messages.json per locale code.
function fakeLocales(entries) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'locales-'));
  for (const [code, summary] of Object.entries(entries)) {
    fs.mkdirSync(path.join(dir, code));
    fs.writeFileSync(
      path.join(dir, code, 'messages.json'),
      JSON.stringify({
        extName: { message: 'Sample Extension' },
        extDescription: { message: summary }
      })
    );
  }
  return dir;
}

const opts = extra => ({ assetsDir: path.join(root, 'store-listing', 'assets'), ...extra });

describe('store listing source of truth (#112)', () => {
  test('the committed listing is valid for every store and matches _locales', () => {
    expect(validateListing(loadListing(root), opts({ localesDir }))).toEqual([]);
  });

  test('every language the extension ships has a listing', () => {
    const listed = Object.values(loadListing(root).locales).map(l => l.extensionLocale);
    const shipped = fs.readdirSync(localesDir);
    expect(shipped.filter(code => !listed.includes(code))).toEqual([]);
  });

  test('every listing carries real text, including pt-PT', () => {
    const { locales } = loadListing(root);
    expect(Object.keys(locales)).toContain('pt-PT');
    expect(locales['pt-PT'].summary).not.toBe(locales.en.summary);
    expect(locales['pt-PT'].description).not.toEqual(locales.en.description);
  });

  test('CHROME_UPDATE.md is generated from the listing', () => {
    const committed = fs.readFileSync(path.join(root, 'store-listing', 'CHROME_UPDATE.md'), 'utf8');
    expect(committed).toBe(renderChromeUpdate(loadListing(root), root));
  });

  test('the sample listing is valid', () => {
    expect(
      validateListing(sample(), opts({ localesDir: fakeLocales({ en: 'A made-up summary.' }) }))
    ).toEqual([]);
  });

  test('a summary over a store limit is reported per store', () => {
    const l = sample();
    l.locales.en.summary = 'x'.repeat(140);
    const errors = validateListing(
      l,
      opts({ localesDir: fakeLocales({ en: l.locales.en.summary }) })
    );
    expect(errors).toEqual([
      'en: summary is 140 characters, chrome allows at most 132',
      'en: summary is 140 characters, edge allows at most 132'
    ]);
  });

  test('a description under the Edge minimum is reported', () => {
    const l = sample();
    l.locales.en.description = ['Too short.'];
    expect(
      validateListing(l, opts({ localesDir: fakeLocales({ en: 'A made-up summary.' }) }))
    ).toEqual(['en: description is 10 characters, edge needs at least 250']);
  });

  test('missing and empty fields are reported', () => {
    const l = sample();
    delete l.locales.en.language;
    l.locales.en.summary = '  ';
    l.locales.en.storeLocales.edge = '';
    const errors = validateListing(
      l,
      opts({ localesDir: fakeLocales({ en: 'A made-up summary.' }) })
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'en: language is missing or empty',
        'en: summary is missing or empty',
        'en: storeLocales.edge is missing or empty'
      ])
    );
  });

  test('a missing screenshot file is reported', () => {
    const l = sample();
    l.locales.en.screenshots = ['nope.png'];
    expect(
      validateListing(l, opts({ localesDir: fakeLocales({ en: 'A made-up summary.' }) }))
    ).toEqual(['en: screenshot nope.png not found in store-listing/assets']);
  });

  test('a shipped _locales language without a listing is reported', () => {
    const dir = fakeLocales({ en: 'A made-up summary.', xx: 'Something else.' });
    expect(validateListing(sample(), opts({ localesDir: dir }))).toEqual([
      '_locales/xx has no store listing'
    ]);
  });

  test('a manifest summary that drifted from the listing is reported', () => {
    const dir = fakeLocales({ en: 'An older summary.' });
    expect(validateListing(sample(), opts({ localesDir: dir }))).toEqual([
      'en: _locales/en/messages.json extDescription differs from the listing summary'
    ]);
  });

  test('a listed language may land before or after its _locales folder', () => {
    const l = sample();
    l.config.locales.push('pt-PT');
    l.locales['pt-PT'] = {
      ...l.locales.en,
      language: 'Portuguese',
      extensionLocale: 'pt_PT',
      storeLocales: { chrome: 'pt-PT', edge: 'pt-PT', firefox: 'pt-PT' },
      summary: 'Um resumo inventado.'
    };
    const before = fakeLocales({ en: 'A made-up summary.' });
    const after = fakeLocales({ en: 'A made-up summary.', pt_PT: 'Um resumo inventado.' });
    expect(validateListing(l, opts({ localesDir: before }))).toEqual([]);
    expect(validateListing(l, opts({ localesDir: after }))).toEqual([]);
  });

  test('locale files and the config list must agree', () => {
    const l = sample();
    l.config.locales.push('de');
    expect(
      validateListing(l, opts({ localesDir: fakeLocales({ en: 'A made-up summary.' }) }))
    ).toEqual([
      'de: listed in store-listing/listing.json but store-listing/locales/de.json is missing'
    ]);
  });
});
