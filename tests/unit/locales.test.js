const fs = require('fs');
const path = require('path');

// Every _locales/<locale>/messages.json must mirror the default locale: same keys,
// same placeholders, same descriptions, and the $VAR$ tokens each message uses.
// Each locale must also be packaged by the build and zip scripts.

const ROOT = path.join(__dirname, '..', '..');
const LOCALES_DIR = path.join(ROOT, '_locales');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const DEFAULT_LOCALE = manifest.default_locale;

// Locales the extension is expected to ship (#118 adds pt_PT).
const EXPECTED_LOCALES = ['cs', 'de', 'en', 'fr', 'nl', 'pt_PT', 'sv'];

// Chrome Web Store limits for the fields the manifest reads from messages.
const LIMITS = { extName: 75, extDescription: 132 };

const PACKAGING_SCRIPTS = ['scripts/build.js', 'scripts/zip.js', 'scripts/build-multi.js'];

const localeDirs = fs
  .readdirSync(LOCALES_DIR, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)
  .sort();

function readMessages(locale) {
  return JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, locale, 'messages.json'), 'utf8'));
}

function varTokens(message) {
  return [...message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)].map(m => m[1].toLowerCase()).sort();
}

const base = readMessages(DEFAULT_LOCALE);

describe('_locales', () => {
  test('default locale from the manifest exists', () => {
    expect(localeDirs).toContain(DEFAULT_LOCALE);
  });

  test('ships the expected locales', () => {
    expect(localeDirs).toEqual(EXPECTED_LOCALES);
  });

  test('manifest __MSG_ keys exist in the default locale', () => {
    const used = [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_@]+)__/g)].map(m => m[1]);
    for (const key of used) {
      expect(base).toHaveProperty(key);
    }
  });

  describe.each(localeDirs)('%s', locale => {
    const messages = readMessages(locale);

    test('has the same keys as the default locale', () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(base).sort());
    });

    test.each(Object.keys(base))('%s keeps placeholders, $VAR$ tokens and description', key => {
      const entry = messages[key];
      expect(typeof entry.message).toBe('string');
      expect(entry.message.trim()).not.toBe('');
      expect(entry.placeholders).toEqual(base[key].placeholders);
      expect(varTokens(entry.message)).toEqual(varTokens(base[key].message));
      expect(entry.description).toBe(base[key].description);
    });

    test.each(Object.entries(LIMITS))('%s is within %i characters', (key, max) => {
      expect([...messages[key].message].length).toBeLessThanOrEqual(max);
    });

    test.each(PACKAGING_SCRIPTS)('is packaged by %s', script => {
      const source = fs.readFileSync(path.join(ROOT, script), 'utf8');
      expect(source).toContain(`'_locales/${locale}/messages.json'`);
    });
  });
});
