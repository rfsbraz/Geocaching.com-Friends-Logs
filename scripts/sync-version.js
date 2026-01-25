#!/usr/bin/env node

/**
 * Syncs version from package.json to manifest.json.
 * This ensures the Chrome extension version matches the npm package version.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const PACKAGE_PATH = path.join(ROOT_DIR, 'package.json');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

function syncVersion() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  if (pkg.version === manifest.version) {
    console.log(`Version already in sync: ${pkg.version}`);
    return;
  }

  console.log(`Syncing version: ${manifest.version} -> ${pkg.version}`);
  manifest.version = pkg.version;

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
  console.log('✓ manifest.json updated');
}

syncVersion();
