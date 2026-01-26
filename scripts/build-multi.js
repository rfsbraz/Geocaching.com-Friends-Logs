#!/usr/bin/env node

/**
 * Multi-browser build script for Chrome, Firefox, and Opera.
 * Creates browser-specific builds with appropriate manifest transformations.
 *
 * Usage:
 *   node scripts/build-multi.js --browser chrome
 *   node scripts/build-multi.js --browser firefox
 *   node scripts/build-multi.js --browser opera
 *   node scripts/build-multi.js --browser all
 */

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

// Files to include in the extension package
const EXTENSION_FILES = [
  'manifest.json',
  'content_script.js',
  'inject.js',
  'init.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'style.css',
  'icon16.png',
  'icon48.png'
];

const BROWSERS = ['chrome', 'firefox', 'opera', 'edge'];

/**
 * Parse command line arguments
 * @returns {string} Browser name or 'all'
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const browserIndex = args.indexOf('--browser');

  if (browserIndex === -1 || !args[browserIndex + 1]) {
    console.error('Usage: node build-multi.js --browser <chrome|firefox|opera|all>');
    process.exit(1);
  }

  const browser = args[browserIndex + 1].toLowerCase();
  if (browser !== 'all' && !BROWSERS.includes(browser)) {
    console.error(`Invalid browser: ${browser}`);
    console.error(`Valid options: ${BROWSERS.join(', ')}, all`);
    process.exit(1);
  }

  return browser;
}

/**
 * Transform manifest for specific browser
 * @param {object} manifest - Original manifest object
 * @param {string} browser - Target browser
 * @returns {object} Transformed manifest
 */
function transformManifest(manifest, browser) {
  const transformed = JSON.parse(JSON.stringify(manifest));

  switch (browser) {
    case 'chrome':
    case 'opera':
    case 'edge':
      // Chrome, Opera, and Edge don't need browser_specific_settings
      delete transformed.browser_specific_settings;
      break;
    case 'firefox':
      // Firefox needs browser_specific_settings, keep as-is
      break;
  }

  return transformed;
}

/**
 * Create a zip file for a specific browser
 * @param {string} browser - Target browser
 * @param {object} manifest - Original manifest
 * @returns {Promise<void>}
 */
async function createBrowserBuild(browser, manifest) {
  const browserDir = path.join(DIST_DIR, browser);
  const version = manifest.version;
  const zipName = `geocaching-friends-logs-v${version}-${browser}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);

  // Create browser directory
  if (!fs.existsSync(browserDir)) {
    fs.mkdirSync(browserDir, { recursive: true });
  }

  // Transform and write manifest
  const transformedManifest = transformManifest(manifest, browser);
  const manifestOutputPath = path.join(browserDir, 'manifest.json');
  fs.writeFileSync(manifestOutputPath, JSON.stringify(transformedManifest, null, 2));

  // Copy other files to browser directory
  for (const file of EXTENSION_FILES) {
    if (file === 'manifest.json') continue;
    const srcPath = path.join(ROOT_DIR, file);
    const destPath = path.join(browserDir, file);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }

  // Remove existing zip if present
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`\nBuilding for ${browser}...`);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(2);
      console.log(`  Created ${zipName} (${sizeKB} KB)`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add files from browser directory
    for (const file of EXTENSION_FILES) {
      const filePath = path.join(browserDir, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
      } else {
        console.warn(`  Warning: ${file} not found, skipping`);
      }
    }

    archive.finalize();
  });
}

/**
 * Main build function
 */
async function main() {
  const targetBrowser = parseArgs();

  // Read original manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  console.log(`Building extension v${manifest.version}`);

  // Create dist directory
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  // Build for specified browser(s)
  const browsersToBuild = targetBrowser === 'all' ? BROWSERS : [targetBrowser];

  for (const browser of browsersToBuild) {
    await createBrowserBuild(browser, manifest);
  }

  console.log('\nBuild complete!');
  console.log(`Output directory: ${DIST_DIR}`);

  if (targetBrowser === 'all') {
    console.log('\nGenerated packages:');
    for (const browser of BROWSERS) {
      console.log(`  - dist/geocaching-friends-logs-v${manifest.version}-${browser}.zip`);
    }
  }
}

main().catch(error => {
  console.error('\nBuild failed:', error.message);
  process.exit(1);
});
