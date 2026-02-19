/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['jest-webextension-mock', './tests/setup.js'],
  testMatch: ['**/tests/unit/**/*.test.js']
};
