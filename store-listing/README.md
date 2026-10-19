# Store listing

The listing text for every store and language lives here, in one place. Change it here first, then copy it to the stores.

## Files

- `listing.json`: settings shared by every language.
  - `name`: the extension name. Must match `extName` in every `_locales/*/messages.json`.
  - `defaultLocale`: the language whose text Chrome shows when it has no translation.
  - `locales`: the listing languages, in the order `CHROME_UPDATE.md` shows them.
  - `stores`: the stores each language is listed on.
  - `limits`: length limits per store and field, in characters (`min` and `max`).
- `locales/<id>.json`: one file per language. `<id>` is a BCP 47 tag such as `sv` or `pt-PT`.
  - `language`: the heading used in `CHROME_UPDATE.md`.
  - `extensionLocale`: the matching `_locales` folder (`sv`, `pt_PT`).
  - `storeLocales`: the language code each store uses. Firefox uses AMO codes (`en-US`, `sv-SE`, `pt-PT`). The Chrome and Edge codes are the ones their public listing pages take in `hl`.
  - `summary`: the short description. It is also the manifest `description`, through `extDescription` in `_locales`.
  - `description`: the full description, one array entry per line. Empty strings are blank lines.
  - `screenshots`: file names in `assets/`.
- `CHROME_UPDATE.md`: the step-by-step guide for the Chrome dashboard. It is generated from the files above and `CHROME_UPDATE.template.md`. Do not edit it by hand.
- `assets/`: icon, screenshots and promo tiles.

## Commands

```bash
npm run store-listing:check   # validate the listing
npm run store-listing:build   # regenerate CHROME_UPDATE.md
```

`npm test` runs the same validation (`tests/unit/store-listing.test.js`) and fails when `CHROME_UPDATE.md` is out of date.

## What the validation checks

- Every language in `listing.json` has a file, and every file is listed.
- No field is missing or empty, and each store has a language code.
- `name`, `summary` and `description` fit every store's limits: summary at most 132 characters (the manifest limit Chrome and Edge use; Firefox allows 250), description at most 16,000 for Chrome and between 250 and 10,000 for Edge, name at most 75 for Chrome and 50 for Firefox.
- Screenshots exist in `assets/`.
- Every `_locales` folder the extension ships has a listing, and its `extName` and `extDescription` match `name` and `summary`.

A listing language may exist before its `_locales` folder. Chrome and Edge then show the default language's summary for it, and the full description still applies.

## Adding or changing a language

1. Edit or add `locales/<id>.json` and, for a new language, add `<id>` to `locales` in `listing.json`.
2. If the extension ships that language, put the same summary in `_locales/<extensionLocale>/messages.json` as `extDescription`.
3. Run `npm run store-listing:build` and `npm test`.
