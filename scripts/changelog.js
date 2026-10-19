/**
 * Reads one version's section from CHANGELOG.md (release-please format) and
 * turns it into plain text for store release notes.
 * Used by scripts/amo-release.js (#114) and scripts/edge-cert-notes.js (#116).
 */

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Markdown body of the section for `version`, or null when there is none. */
function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const heading = new RegExp(`^#{2,3} \\[?v?${escapeRegExp(version)}\\]?(?:\\(|\\s|$)`);
  const start = lines.findIndex(line => heading.test(line));
  if (start === -1) {
    return null;
  }
  let end = lines.findIndex((line, i) => i > start && /^#{2,3} \[?v?\d+\.\d+/.test(line));
  if (end === -1) {
    end = lines.length;
  }
  return lines
    .slice(start + 1, end)
    .join('\n')
    .trim();
}

/** Plain text: section titles as lines, entries as "- " bullets, no links or hashes. */
function toPlainText(section) {
  const out = [];
  let afterTitle = false;
  for (const raw of section.split('\n')) {
    let line = raw.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== '' && !afterTitle) {
        out.push('');
      }
      continue;
    }
    line = line
      .replace(/\s*\(\[[0-9a-f]{7,40}\]\([^)]*\)\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1');
    const title = line.match(/^#{3,}\s+(.*)$/);
    if (title) {
      if (out.length && out[out.length - 1] !== '') {
        out.push('');
      }
      out.push(title[1]);
      afterTitle = true;
      continue;
    }
    afterTitle = false;
    out.push(line.replace(/^[*-]\s+/, '- '));
  }
  return out.join('\n').trim();
}

/** Plain-text notes for `version`. Throws when CHANGELOG.md has no section for it. */
function releaseNotes(changelog, version) {
  const section = changelogSection(changelog, version);
  if (section == null || !section.trim()) {
    throw new Error(`CHANGELOG.md has no entries for version ${version}`);
  }
  return toPlainText(section);
}

module.exports = { changelogSection, toPlainText, releaseNotes };
