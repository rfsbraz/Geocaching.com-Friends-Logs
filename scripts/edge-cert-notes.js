#!/usr/bin/env node

/**
 * Builds the Edge Add-ons "notes for certification" for a release: the testing
 * steps in store-listing/edge-certification-notes.txt, then the CHANGELOG.md
 * section for the version, as plain text.
 *
 * Usage:
 *   node scripts/edge-cert-notes.js [--version 2.5.0]    prints the notes (dry run)
 *   node scripts/edge-cert-notes.js --github-output      also sets the step output "notes"
 *
 * --version defaults to package.json. The script sends nothing and needs no credentials;
 * release.yml passes the output to wdzeng/edge-addon as notes-for-certification.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { releaseNotes } = require('./changelog');

const ROOT_DIR = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT_DIR, 'store-listing', 'edge-certification-notes.txt');
// Microsoft documents no limit for this field. Keep it short enough for a reviewer to read.
const MAX_LENGTH = 2000;
const MORE = '\n(The full list is in CHANGELOG.md in the GitHub repository.)';

function buildNotes({ changelog, version, template }) {
  const head = `${template.trim()}\n\nChanges in ${version}:\n`;
  const changes = releaseNotes(changelog, version);
  if (head.length + changes.length <= MAX_LENGTH) {
    return head + changes;
  }
  const kept = [];
  let length = head.length + MORE.length;
  for (const line of changes.split('\n')) {
    if (length + line.length + 1 > MAX_LENGTH) {
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return head + kept.join('\n').trim() + MORE;
}

/** Appends a multiline step output with a random delimiter the value cannot contain. */
function githubOutput(file, name, value) {
  let delimiter;
  do {
    delimiter = `EOF_${crypto.randomBytes(8).toString('hex')}`;
  } while (value.includes(delimiter));
  fs.appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function main(argv) {
  let version = null;
  let toOutput = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--version') {
      version = argv[++i];
    } else if (argv[i] === '--github-output') {
      toOutput = true;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  version =
    version || JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version;
  const notes = buildNotes({
    changelog: fs.readFileSync(path.join(ROOT_DIR, 'CHANGELOG.md'), 'utf8'),
    version,
    template: fs.readFileSync(TEMPLATE_PATH, 'utf8')
  });
  console.log(notes);
  console.log(`\n(${notes.length} characters)`);
  if (toOutput) {
    if (!process.env.GITHUB_OUTPUT) {
      throw new Error('--github-output needs GITHUB_OUTPUT');
    }
    githubOutput(process.env.GITHUB_OUTPUT, 'notes', notes);
  }
}

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(`::error title=Edge notes::${error.message}`);
    process.exit(1);
  }
}

module.exports = { buildNotes, githubOutput, MAX_LENGTH };
