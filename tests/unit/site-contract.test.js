const fs = require('fs');
const path = require('path');
const { checkContract } = require('../../scripts/check-site-contract');

// Trimmed, token-free logged-out cache page (see the comment at the top of the fixture).
const html = fs.readFileSync(
  path.join(__dirname, '..', 'fixtures', 'logbook-logged-out.html'),
  'utf8'
);
// The two strings inject.js depends on in the site's cachedetails-main bundle.
const bundle = 'n=$("#cache_logs_table");fetch("/seek/geocache.logbook?"+f)';

describe('geocaching.com site contract (#86)', () => {
  test('saved fixture satisfies the contract', () => {
    expect(checkContract(html, bundle)).toEqual([]);
  });

  test('fixture carries no real userToken', () => {
    const tokens = [...html.matchAll(/userToken\s*=\s*'([^']*)'/g)].map(m => m[1]);
    expect(tokens).toEqual(['REDACTED']);
  });

  test('fails when the logbook container is no longer targeted', () => {
    const drifted = bundle.replace('#cache_logs_table', '#logbook-root');
    expect(checkContract(html, drifted)).toEqual([expect.stringContaining('#cache_logs_table')]);
  });

  test('fails when the row template or its registration disappears', () => {
    const noTmpl = html.replace('id="tmpl_CacheLogRow"', 'id="tmpl_Other"');
    expect(checkContract(noTmpl, bundle)).toContainEqual(
      expect.stringContaining('template not found')
    );
    const noReg = html.replace('.template("tmplCacheLogRow")', '');
    expect(checkContract(noReg, bundle)).toContainEqual(expect.stringContaining('registration'));
  });

  test('fails when the row template stops rendering <tr class="log-row">', () => {
    const div = html.replace('<tr class="log-row', '<div class="log-row');
    expect(checkContract(div, bundle)).toContainEqual(
      expect.stringContaining('<tr class="log-row">')
    );
  });

  test('fails without userToken or logbook endpoint', () => {
    expect(checkContract(html.replace(/userToken = 'REDACTED'/, ''), bundle)).toContainEqual(
      expect.stringContaining('userToken')
    );
    expect(
      checkContract(html, bundle.replace('/seek/geocache.logbook', '/api/logs'))
    ).toContainEqual(expect.stringContaining('/seek/geocache.logbook'));
  });
});
