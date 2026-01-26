#!/usr/bin/env node

/**
 * Creates a zip file for Chrome Web Store submission.
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
  'icons/icon16.png',
  'icons/icon48.png',
];

async function createZip() {
  // Read version from manifest
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const version = manifest.version;

  // Create dist directory if it doesn't exist
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const zipName = `geocaching-friends-logs-v${version}.zip`;
  const zipPath = path.join(DIST_DIR, zipName);

  // Remove existing zip if present
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  console.log(`Creating ${zipName}...`);

  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', () => {
      const sizeKB = (archive.pointer() / 1024).toFixed(2);
      console.log(`✓ Created ${zipPath}`);
      console.log(`  Size: ${sizeKB} KB`);
      resolve();
    });

    archive.on('error', reject);
    archive.pipe(output);

    // Add files to archive
    for (const file of EXTENSION_FILES) {
      const filePath = path.join(ROOT_DIR, file);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: file });
        console.log(`  + ${file}`);
      } else {
        console.warn(`  ! ${file} not found, skipping`);
      }
    }

    archive.finalize();
  });
}

createZip()
  .then(() => {
    console.log('\n✓ Package created successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n✗ Failed to create package:', error.message);
    process.exit(1);
  });
