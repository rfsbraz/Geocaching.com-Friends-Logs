// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: false
  },
  projects: [
    {
      name: 'chromium',
      testMatch: /chromium\.spec\.js/
    },
    {
      name: 'firefox',
      testMatch: /firefox\.spec\.js/
    },
    {
      name: 'screenshots',
      testMatch: /screenshots\.spec\.js/
    },
    {
      name: 'real-page',
      testMatch: /real-page\.spec\.js/
    }
  ]
});
