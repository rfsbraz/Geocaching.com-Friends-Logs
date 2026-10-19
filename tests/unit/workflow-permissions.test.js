const fs = require('fs');
const path = require('path');

// Code scanning rule actions/missing-workflow-permissions (#131): every workflow
// sets a read-only default and every job declares its own permissions, so no job
// falls back to the repository default token scopes.
//
// No YAML parser is a direct dependency, so this reads the GitHub Actions layout
// by indentation: top-level keys at column 0, job ids at 2 spaces, job keys at 4.

const WORKFLOWS = path.join(__dirname, '..', '..', '.github', 'workflows');

function keyAt(line, indent) {
  const match = line.match(/^( *)([A-Za-z0-9_-]+|'[^']+'|"[^"]+"):(\s|$)/);
  if (!match || match[1].length !== indent) {
    return null;
  }
  return match[2].replace(/^['"]|['"]$/g, '');
}

function parseWorkflow(text) {
  const lines = text.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
  const top = {};
  const jobs = {};
  let section = null;
  let job = null;
  for (const line of lines) {
    const topKey = keyAt(line, 0);
    if (topKey) {
      section = topKey;
      job = null;
      top[topKey] = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }
    if (section !== 'jobs') {
      continue;
    }
    const jobId = keyAt(line, 2);
    if (jobId) {
      job = jobId;
      jobs[job] = new Set();
      continue;
    }
    const jobKey = job && keyAt(line, 4);
    if (jobKey) {
      jobs[job].add(jobKey);
    }
  }
  return { top, jobs };
}

const files = fs.readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/.test(name));

describe('workflow permissions (#131)', () => {
  test('finds the workflows', () => {
    expect(files).toEqual(expect.arrayContaining(['ci.yml', 'release.yml']));
  });

  describe.each(files)('%s', file => {
    const { top, jobs } = parseWorkflow(fs.readFileSync(path.join(WORKFLOWS, file), 'utf8'));

    test('sets a workflow-level permissions default', () => {
      expect(top).toHaveProperty('permissions');
    });

    test('every job declares permissions', () => {
      const ids = Object.keys(jobs);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids.filter(id => !jobs[id].has('permissions'))).toEqual([]);
    });
  });
});
