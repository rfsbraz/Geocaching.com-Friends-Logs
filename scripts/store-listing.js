#!/usr/bin/env node
/**
 * Store listing source of truth (#112).
 *
 * store-listing/listing.json      shared settings: name, locale order, stores, length limits
 * store-listing/locales/<id>.json one file per listing language
 *
 * Usage:
 *   node scripts/store-listing.js check   validate the listing (exit 1 on errors)
 *   node scripts/store-listing.js build   regenerate store-listing/CHROME_UPDATE.md
 *
 * Other scripts can require this module and use loadListing() to read the text
 * for a store, with each language's code for that store in storeLocales.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const STRING_FIELDS = ['language', 'extensionLocale', 'summary'];

/** Read listing.json and every locale file it names. A missing file is left out. */
function loadListing(root = ROOT) {
  const dir = path.join(root, 'store-listing');
  const config = JSON.parse(fs.readFileSync(path.join(dir, 'listing.json'), 'utf8'));
  const locales = {};
  for (const id of config.locales) {
    const file = path.join(dir, 'locales', `${id}.json`);
    if (fs.existsSync(file)) {
      locales[id] = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  return { config, locales };
}

/** Description lines joined into the text a store shows. */
function descriptionText(locale) {
  return locale.description.join('\n');
}

const filled = v => typeof v === 'string' && v.trim() !== '';
const length = s => [...s].length;

/**
 * Every problem with the listing, as readable strings. An empty array means valid.
 * options.localesDir: the extension's _locales folder.
 * options.assetsDir:  where screenshots live.
 */
function validateListing(listing, { localesDir, assetsDir }) {
  const { config, locales } = listing;
  const errors = [];

  for (const id of config.locales) {
    if (!locales[id]) {
      errors.push(
        `${id}: listed in store-listing/listing.json but store-listing/locales/${id}.json is missing`
      );
    }
  }
  for (const id of Object.keys(locales)) {
    if (!config.locales.includes(id)) {
      errors.push(`${id}: store-listing/locales/${id}.json is not listed in listing.json`);
    }
  }

  for (const [id, locale] of Object.entries(locales)) {
    for (const field of STRING_FIELDS) {
      if (!filled(locale[field])) {
        errors.push(`${id}: ${field} is missing or empty`);
      }
    }
    for (const store of config.stores) {
      if (!filled(locale.storeLocales && locale.storeLocales[store])) {
        errors.push(`${id}: storeLocales.${store} is missing or empty`);
      }
    }
    const description = Array.isArray(locale.description) ? locale.description : [];
    if (!description.every(line => typeof line === 'string') || !description.some(filled)) {
      errors.push(`${id}: description is missing or empty`);
    }
    const screenshots = Array.isArray(locale.screenshots) ? locale.screenshots : [];
    if (!screenshots.some(filled)) {
      errors.push(`${id}: screenshots is missing or empty`);
    }
    for (const shot of screenshots) {
      if (filled(shot) && !fs.existsSync(path.join(assetsDir, shot))) {
        errors.push(`${id}: screenshot ${shot} not found in store-listing/assets`);
      }
    }

    const values = {
      name: config.name,
      summary: filled(locale.summary) ? locale.summary : null,
      description: description.some(filled) ? descriptionText(locale) : null
    };
    for (const store of config.stores) {
      for (const [field, { min, max }] of Object.entries(config.limits[store] || {})) {
        const value = values[field];
        if (value == null) {
          continue;
        }
        const n = length(value);
        if (max != null && n > max) {
          errors.push(`${id}: ${field} is ${n} characters, ${store} allows at most ${max}`);
        }
        if (min != null && n < min) {
          errors.push(`${id}: ${field} is ${n} characters, ${store} needs at least ${min}`);
        }
      }
    }
  }

  // The manifest name and summary come from _locales. Every language the
  // extension ships needs a listing, and its text must match. A listing whose
  // _locales folder does not exist yet is fine: the store then shows the
  // default language's summary for it.
  const shipped = fs.existsSync(localesDir) ? fs.readdirSync(localesDir).sort() : [];
  const byExtensionLocale = new Map(
    Object.entries(locales).map(([id, l]) => [l.extensionLocale, id])
  );
  for (const code of shipped) {
    const id = byExtensionLocale.get(code);
    if (!id) {
      errors.push(`_locales/${code} has no store listing`);
      continue;
    }
    const messages = JSON.parse(
      fs.readFileSync(path.join(localesDir, code, 'messages.json'), 'utf8')
    );
    const message = key => messages[key] && messages[key].message;
    if (message('extDescription') !== locales[id].summary) {
      errors.push(
        `${id}: _locales/${code}/messages.json extDescription differs from the listing summary`
      );
    }
    if (message('extName') !== config.name) {
      errors.push(`${id}: _locales/${code}/messages.json extName differs from listing.json name`);
    }
  }

  return errors;
}

/** store-listing/CHROME_UPDATE.md, filled in from the template. */
function renderChromeUpdate(listing, root = ROOT) {
  const { config, locales } = listing;
  const template = fs.readFileSync(
    path.join(root, 'store-listing', 'CHROME_UPDATE.template.md'),
    'utf8'
  );
  const main = locales[config.defaultLocale];
  const translations = config.locales
    .filter(id => id !== config.defaultLocale)
    .map(id => {
      const l = locales[id];
      return [
        `### ${l.language}`,
        '',
        `Summary (only used if the package has \`_locales/${l.extensionLocale}/messages.json\`):`,
        '',
        `> ${l.summary}`,
        '',
        'Description:',
        '',
        '```text',
        descriptionText(l),
        '```'
      ].join('\n');
    })
    .join('\n\n');
  const values = {
    summaryLength: String(length(main.summary)),
    summary: main.summary,
    description: descriptionText(main),
    translations
  };
  const header =
    '<!-- Generated by `npm run store-listing:build` from listing.json, locales/*.json and CHROME_UPDATE.template.md. Edit those, not this file. -->\n\n';
  return header + template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key]);
}

if (require.main === module) {
  const command = process.argv[2];
  const listing = loadListing();
  if (command === 'check') {
    const errors = validateListing(listing, {
      localesDir: path.join(ROOT, '_locales'),
      assetsDir: path.join(ROOT, 'store-listing', 'assets')
    });
    for (const e of errors) {
      console.error(e);
    }
    console.log(errors.length ? `${errors.length} problem(s)` : 'store listing OK');
    process.exit(errors.length ? 1 : 0);
  } else if (command === 'build') {
    fs.writeFileSync(
      path.join(ROOT, 'store-listing', 'CHROME_UPDATE.md'),
      renderChromeUpdate(listing)
    );
    console.log('wrote store-listing/CHROME_UPDATE.md');
  } else {
    console.error('usage: node scripts/store-listing.js check|build');
    process.exit(2);
  }
}

module.exports = { loadListing, validateListing, renderChromeUpdate, descriptionText };
