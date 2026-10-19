const fs = require('fs');
const path = require('path');

// package.json is the release-please source of truth for the node package.
// manifest.json must stay in lockstep (unpacked loads and store uploads read it),
// and release-please must bump it via extra-files so the two cannot drift again.

const ROOT = path.join(__dirname, '..', '..');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

describe('extension version (#123)', () => {
  const pkg = readJson('package.json');
  const manifest = readJson('manifest.json');
  const releasePlease = readJson('release-please-config.json');

  test('manifest.json version matches package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  test('release-please bumps manifest.json via extra-files', () => {
    const entries = releasePlease.packages?.['.']?.['extra-files'] ?? [];
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'json',
          path: 'manifest.json',
          jsonpath: '$.version'
        })
      ])
    );
  });
});
