const fs = require('fs');
const path = require('path');

// Release workflow (#144). 2.5.0 was tagged but never published: the push that
// followed the release merge cancelled the run that had just created the tag, and
// the action's release-type input made release-please ignore
// release-please-config.json, so manifest.json was never bumped.
//
// No YAML parser is a direct dependency, so these checks read the workflow text.

const ROOT = path.join(__dirname, '..', '..');
const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'release-please-config.json'), 'utf8'));

// Lines of one job, from its "  id:" line up to the next job id.
function jobBlock(id) {
  const lines = workflow.split('\n');
  const start = lines.findIndex(line => line === `  ${id}:`);
  if (start === -1) {
    return '';
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex(line => /^ {2}[A-Za-z0-9_-]+:/.test(line) || /^\S/.test(line));
  return [lines[start], ...(end === -1 ? rest : rest.slice(0, end))].join('\n');
}

// The "with:" block of the step that uses the given action.
function stepWith(job, action) {
  const lines = jobBlock(job).split('\n');
  const start = lines.findIndex(line => line.includes(`uses: ${action}`));
  if (start === -1) {
    return null;
  }
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^ {6}- /.test(line)) {
      break;
    }
    out.push(line);
  }
  return out.join('\n');
}

describe('release workflow (#144)', () => {
  test('release-please reads release-please-config.json (no release-type input)', () => {
    const inputs = stepWith('release-please', 'googleapis/release-please-action@');
    expect(inputs).not.toBeNull();
    expect(inputs).not.toMatch(/release-type:/);
  });

  test('release-please-config.json keeps the node strategy and the manifest.json bump', () => {
    const pkg = config.packages['.'];
    expect(pkg['release-type']).toBe('node');
    expect(pkg['extra-files']).toEqual(
      expect.arrayContaining([{ type: 'json', path: 'manifest.json', jsonpath: '$.version' }])
    );
  });

  test('a running release is never cancelled by the next push', () => {
    const concurrency = workflow.match(/^concurrency:\n((?: {2}.*\n)+)/m);
    expect(concurrency).not.toBeNull();
    expect(concurrency[1]).toMatch(/cancel-in-progress: false/);
  });

  test('workflow_dispatch republishes an existing tag', () => {
    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}tag:\n/m);
    expect(jobBlock('release-please')).toMatch(/if: \$\{\{ github\.event_name == 'push' \}\}/);
  });

  test.each(['build-release', 'publish-to-firefox', 'publish-to-edge'])(
    '%s checks out the release tag, not the pushed commit',
    job => {
      const checkout = stepWith(job, 'actions/checkout@');
      expect(checkout).not.toBeNull();
      expect(checkout).toMatch(/ref: \$\{\{ needs\.target\.outputs\.ref \}\}/);
    }
  );

  test.each(['build-release', 'publish-to-chrome', 'publish-to-firefox', 'publish-to-edge'])(
    '%s runs for a new release and for a dispatch',
    job => {
      expect(jobBlock(job)).toMatch(/needs: \[?.*\btarget\b/);
    }
  );
});
