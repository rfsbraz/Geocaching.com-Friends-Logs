#!/usr/bin/env node

/**
 * Build script for Geocaching.com Friends Logs extension.
 * Validates the manifest and prepares the extension for packaging.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT_DIR, 'manifest.json');

// Files required for the extension
const REQUIRED_FILES = [
  'manifest.json',
  'content_script.js',
  'inject.js',
  'init.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'style.css',
  'icons/icon16.png',
  'icons/icon48.png',
];

function validateManifest() {
  console.log('Validating manifest.json...');

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  if (manifest.manifest_version !== 3) {
    throw new Error('Manifest version must be 3');
  }

  if (!manifest.version) {
    throw new Error('Version is required');
  }

  if (!manifest.name) {
    throw new Error('Name is required');
  }

  console.log(`  Name: ${manifest.name}`);
  console.log(`  Version: ${manifest.version}`);
  console.log(`  Manifest Version: ${manifest.manifest_version}`);

  return manifest;
}

function checkRequiredFiles() {
  console.log('\nChecking required files...');

  const missing = [];

  for (const file of REQUIRED_FILES) {
    const filePath = path.join(ROOT_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`  ✓ ${file}`);
    } else {
      console.log(`  ✗ ${file} (MISSING)`);
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required files: ${missing.join(', ')}`);
  }
}

function main() {
  console.log('Building Geocaching.com Friends Logs extension...\n');

  try {
    validateManifest();
    checkRequiredFiles();
    console.log('\n✓ Build validation passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Build failed:', error.message);
    process.exit(1);
  }
}

main();
