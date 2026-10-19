const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildNotes, githubOutput, MAX_LENGTH } = require('../../scripts/edge-cert-notes');

const ROOT = path.join(__dirname, '..', '..');
const changelog =
  '## [2.5.0](x) (2026-10-20)\n\n### Bug Fixes\n\n* **inject:** a fix ([#1](u)) ([abcdef1](c))\n';
const template = 'How to test:\n1. Sign in.\n';

describe('Edge notes for certification (#116)', () => {
  test("notes are the testing template followed by this version's changes", () => {
    expect(buildNotes({ changelog, version: '2.5.0', template })).toBe(
      'How to test:\n1. Sign in.\n\nChanges in 2.5.0:\nBug Fixes\n- inject: a fix (#1)'
    );
  });

  test('a version missing from CHANGELOG.md fails instead of sending empty notes', () => {
    expect(() => buildNotes({ changelog, version: '9.9.9', template })).toThrow(/9\.9\.9/);
  });

  test('long changes are cut to fit, keeping the testing template whole', () => {
    const many = Array.from({ length: 200 }, (_, i) => `* change number ${i} ([#${i}](u))`).join(
      '\n'
    );
    const notes = buildNotes({
      changelog: `## [2.5.0](x)\n\n### Features\n\n${many}\n`,
      version: '2.5.0',
      template
    });
    expect(notes.length).toBeLessThanOrEqual(MAX_LENGTH);
    expect(notes.startsWith('How to test:\n1. Sign in.')).toBe(true);
    expect(notes).toMatch(/CHANGELOG\.md/);
    expect(notes).not.toMatch(/change number \d*$/);
  });

  test('the repo template and current CHANGELOG.md produce notes', () => {
    const { version } = require(path.join(ROOT, 'package.json'));
    const notes = buildNotes({
      changelog: fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
      version,
      template: fs.readFileSync(
        path.join(ROOT, 'store-listing', 'edge-certification-notes.txt'),
        'utf8'
      )
    });
    expect(notes).toMatch(/geocaching\.com/i);
    expect(notes).toContain(`Changes in ${version}:`);
    expect(notes.length).toBeLessThanOrEqual(MAX_LENGTH);
  });

  test('githubOutput writes a multiline output whose delimiter is not in the notes', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gho-')), 'out');
    fs.writeFileSync(file, 'other=1\n');
    githubOutput(file, 'notes', 'line one\nEOF\nline three');
    const text = fs.readFileSync(file, 'utf8');
    const match = text.match(/^notes<<(\S+)\n([\s\S]*)\n\1\n$/m);
    expect(text.startsWith('other=1\n')).toBe(true);
    expect(match).not.toBeNull();
    expect(match[1]).not.toBe('EOF');
    expect(match[2]).toBe('line one\nEOF\nline three');
  });
});
