# Store listing

The listing text for every store and language lives here, in one place. Change it here first, then copy it to the stores.

## Files

- `listing.json`: settings shared by every language.
  - `name`: the extension name. Must match `extName` in every `_locales/*/messages.json`.
  - `defaultLocale`: the language whose text Chrome shows when it has no translation.
  - `locales`: the listing languages, in the order `CHROME_UPDATE.md` shows them.
  - `stores`: the stores each language is listed on.
  - `storeIds`: the item on each store: Chrome Web Store item id, Edge Add-ons crx id, Firefox add-on guid.
  - `limits`: length limits per store and field, in characters (`min` and `max`).
- `locales/<id>.json`: one file per language. `<id>` is a BCP 47 tag such as `sv` or `pt-PT`.
  - `language`: the heading used in `CHROME_UPDATE.md`.
  - `extensionLocale`: the matching `_locales` folder (`sv`, `pt_PT`).
  - `storeLocales`: the language code each store uses, checked against the live stores:
    - Chrome: the `hl` value of the public item page, which it echoes in `<html lang>` (`en`, `sv`, `pt-PT`).
    - Edge: a language and region tag (`en-US`, `sv-SE`, `fr-FR`, `pt-PT`). Edge fills in a region for a bare language, and not always the expected one: `fr` becomes `fr-CA`.
    - Firefox: the AMO locale (`en-US`, `sv-SE`, `pt-PT`, `cs`).
  - `summary`: the short description. It is also the manifest `description`, through `extDescription` in `_locales`.
  - `description`: the full description, one array entry per line. Empty strings are blank lines.
  - `screenshots`: file names in `assets/`.
- `CHROME_UPDATE.md`: the step-by-step guide for the Chrome dashboard. It is generated from the files above and `CHROME_UPDATE.template.md`. Do not edit it by hand.
- `assets/`: icon, screenshots and promo tiles.

## Commands

```bash
npm run store-listing:check   # validate the listing
npm run store-listing:build   # regenerate CHROME_UPDATE.md
npm run store-listing:amo     # show how the live Firefox listing differs (dry run)
npm run store-listing:drift   # compare the public Chrome, Edge and Firefox listings (writes drift/)
```

`npm test` runs the same validation (`tests/unit/store-listing.test.js`) and fails when `CHROME_UPDATE.md` is out of date.

## What the validation checks

- Every language in `listing.json` has a file, and every file is listed.
- No field is missing or empty, and each store has a language code.
- `name`, `summary` and `description` fit every store's limits: summary at most 132 characters (the manifest limit Chrome and Edge use; Firefox allows 250), description at most 16,000 for Chrome and between 250 and 10,000 for Edge, name at most 75 for Chrome and 50 for Firefox.
- Screenshots exist in `assets/`.
- Every `_locales` folder the extension ships has a listing, and its `extName` and `extDescription` match `name` and `summary`.

A listing language may exist before its `_locales` folder. Chrome and Edge then show the default language's summary for it, and the full description still applies.

## Firefox (AMO) sync

`scripts/amo-listing.js` keeps the Firefox Add-ons summary and description in line with this folder, for every language, using `storeLocales.firefox` as the AMO locale.

- Dry run (the default): reads the live listing from the public AMO v5 API, no login, and prints a line diff per locale and field. Nothing is sent.
- `--apply`: sends one `PATCH /api/v5/addons/addon/{guid}/` per locale that differs, with only that locale's `summary` and `description`. It signs each request with `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`, the same AMO API key the release workflow uses to upload.
- Locales that exist on AMO but not here are reported and left alone.

The comparison ignores what AMO adds on display (links to its redirector, HTML escaping), line endings and trailing spaces.

`.github/workflows/amo-listing.yml` runs the dry run and then `--apply` on every push to `main` that changes `listing.json`, `locales/` or the script. Run it by hand from Actions > AMO listing: unticked it is a dry run, with "apply" ticked it updates AMO.

## Weekly drift check

`scripts/store-drift.js` reads the public listing of every language on each store, with no login, no cookies and no secrets, and compares the summary and description with this folder:

- Chrome: `https://chromewebstore.google.com/detail/<id>?hl=<code>`, the item page HTML.
- Edge: `https://microsoftedge.microsoft.com/addons/getproductdetailsbycrxid/<id>?hl=<code>`, the public JSON the Edge item page loads.
- Firefox: the public AMO v5 API, one request for all languages.

Whitespace is ignored, because stores reflow it. Chrome and Edge take the summary from the package, so a language the package does not ship in `_locales` is expected to show the default language's summary there. A store that answers a language code with a different language is reported, so a wrong `storeLocales` value shows up.

It writes `drift/<store>.md` for each store that differs, with the exact text to paste per language, and `drift/summary.json`. Locally that is all it does: it never creates issues.

`.github/workflows/store-drift.yml` runs it every Monday and on demand (Actions > Store listing drift). For each store it opens or updates the issue "Store listing drift: <store>" with the report, and closes it once the store matches again. If a store cannot be read, its issue is left as it is and the run fails. Chrome and Edge text can only be changed in their dashboards; for Firefox, run the AMO listing workflow with "apply" ticked.

## Adding or changing a language

1. Edit or add `locales/<id>.json` and, for a new language, add `<id>` to `locales` in `listing.json`.
2. If the extension ships that language, put the same summary in `_locales/<extensionLocale>/messages.json` as `extDescription`.
3. Run `npm run store-listing:build` and `npm test`.
