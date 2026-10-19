const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const pkg = require('../../package.json');

describe('browser packages', () => {
  test('does not define a build:opera script', () => {
    expect(pkg.scripts['build:opera']).toBeUndefined();
  });

  test('build-multi browsers list excludes opera', () => {
    const src = fs.readFileSync(path.join(ROOT, 'scripts/build-multi.js'), 'utf8');
    const match = src.match(/const BROWSERS = \[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const browsers = match[1].split(',').map(s => s.trim().replace(/['"]/g, ''));
    expect(browsers).toEqual(['chrome', 'firefox', 'edge']);
    expect(browsers).not.toContain('opera');
  });
});
