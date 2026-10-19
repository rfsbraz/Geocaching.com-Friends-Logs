# Chrome Web Store listing update

Everything needed to refresh the Geocaching.com Friends Logs listing in the Chrome Web Store developer dashboard. Files live next to this guide in `assets/` and `locales/`.

Dashboard: https://chrome.google.com/webstore/devconsole , pick the extension, then open the **Store listing** tab.

## 1. Title and summary (from the package)

Chrome does not let you edit these in the dashboard. They come from `manifest.json`:

- `name`: `Geocaching.com Friends Logs`
- `description` (max 132 characters, this one is {{summaryLength}}):

  > {{summary}}

These change only after a new version with the updated manifest is uploaded and approved. The manifest change is being done in a separate PR.

## 2. Description (English)

Paste this into **Description** on the Store listing tab:

```text
{{description}}
```

## 3. Category and language

- Category: **Social & Communication** (fallback: **Productivity**, if you think it fits the store better)
- Language: English (default)

## 4. Graphics

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `assets/icon128.png` | 128x128 (normally taken from the package, only upload if asked) |
| Screenshots | `assets/screenshot-1.png` | 1280x800 |
| Small promo tile | `assets/promo_small_440x280.png` | 440x280, PNG with no alpha |
| Marquee promo tile | `assets/promo_marquee_1400x560.png` | 1400x560, PNG with no alpha |

The marquee shows a real friend log; the username and avatar are blurred.

Chrome allows up to 5 screenshots. More are planned (popup settings, before and after on a cache page). Add them as `screenshot-2.png` and so on when ready.

## 5. Translations

How Chrome handles languages:

- The **description** can be set per language in the dashboard. Use the language picker at the top of the Store listing tab, choose the language, paste the description, save.
- The **summary** and title per language only work if the package ships `_locales/<lang>/messages.json` and the manifest uses `__MSG_...__` with a `default_locale`. Without that, every language shows the English summary. The localized summaries below are ready for when `_locales` is added.

Full texts are also in `locales/<lang>.json`. None of them have been checked by a native speaker yet.

{{translations}}

## 6. Privacy practices tab

- **Single purpose**: Shows your friends' logs and your own logs at the top of Geocaching.com cache pages, so you do not have to search the logbook for them.
- **storage permission**: Used only to save display settings (how many logs to show, and whether friends' logs and your own logs are shown). Nothing else is stored.
- **Host permissions** (`geocaching.com/geocache/GC*`): Needed to read the logs on the cache page you are viewing and show your friends' logs at the top.
- **Remote code**: No, the extension does not use remote code.
- **Data usage**: No user data is collected. Leave every data type unchecked and tick the three certifications (no selling data, no unrelated use, no creditworthiness use).

## 7. Save and submit

1. Click **Save draft**.
2. Click **Submit for review**. Listing-only changes usually go through faster than code changes.
