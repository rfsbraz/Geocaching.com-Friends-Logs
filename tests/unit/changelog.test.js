const fs = require('fs');
const path = require('path');
const { changelogSection, toPlainText, releaseNotes } = require('../../scripts/changelog');

const sample = `# Changelog

## [2.5.0](https://github.com/o/r/compare/v2.4.0...v2.5.0) (2026-10-20)


### Features

* **i18n:** add European Portuguese translation ([#120](https://github.com/o/r/issues/120)) ([ac4a22a](https://github.com/o/r/commit/ac4a22a))


### Bug Fixes

* stop the popup from flickering ([#99](https://github.com/o/r/issues/99)) ([1234567](https://github.com/o/r/commit/1234567890abcdef))

## [2.4.0](https://github.com/o/r/compare/v2.3.6...v2.4.0) (2026-10-13)


### Features

* older entry
`;

describe('CHANGELOG.md release notes (#114, #116)', () => {
  test('changelogSection returns only the requested version', () => {
    const section = changelogSection(sample, '2.5.0');
    expect(section).toContain('European Portuguese');
    expect(section).toContain('popup');
    expect(section).not.toContain('older entry');
  });

  test('changelogSection returns null for a missing version', () => {
    expect(changelogSection(sample, '9.9.9')).toBeNull();
  });

  test('changelogSection does not match a version prefix', () => {
    expect(changelogSection('## [2.4.10](x) (d)\n\n* a\n', '2.4.1')).toBeNull();
  });

  test('toPlainText drops links, commit hashes and markdown markers', () => {
    expect(toPlainText(changelogSection(sample, '2.5.0'))).toBe(
      [
        'Features',
        '- i18n: add European Portuguese translation (#120)',
        '',
        'Bug Fixes',
        '- stop the popup from flickering (#99)'
      ].join('\n')
    );
  });

  test('releaseNotes throws when the version has no section', () => {
    expect(() => releaseNotes(sample, '9.9.9')).toThrow(/9\.9\.9/);
  });

  test('the current package.json version has notes in CHANGELOG.md', () => {
    const root = path.join(__dirname, '..', '..');
    const { version } = require(path.join(root, 'package.json'));
    const notes = releaseNotes(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version);
    expect(notes.length).toBeGreaterThan(0);
    expect(notes).not.toMatch(/\]\(|https?:\/\//);
  });
});
