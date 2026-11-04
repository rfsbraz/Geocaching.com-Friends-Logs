# Privacy and permission notes

Reviewed against source version 2.7.0, commit 434a18e7965de207fbb579dabfcaaf455d63dd8e. These are submission notes, not a claim that any dashboard certification was completed.

- Single purpose: make friends' and optionally the user's own Geocaching.com logs easier to read on cache pages.
- `storage`: saves display preferences and small local flags used for the one-time rating prompt. No analytics service receives these values.
- Content scripts: limited to `https://www.geocaching.com/geocache/GC*` and matching Geocaching.com subdomains. They insert the extension's bundled script and style to display log sections.
- Network: logbook requests go to Geocaching.com in the signed-in page context using the page token. Do not describe this as “no network requests” or “no personal data is processed”: usernames and log text are processed to display the feature.
- No developer-operated collection endpoint or analytics was found in the reviewed code. Logs are not uploaded to an external extension service.
- Remote code: the extension ships its own script; it uses page-provided jQuery and page globals already present on Geocaching.com. It does not download a separate extension code payload.
- External navigation: rating links open the browser's store. A problem-report link opens GitHub with context; the user reviews and submits the report. The extension does not send an issue automatically.
- No affiliate feature is part of this extension. The book-price tracker's settings do not apply here.
- Set `privacy_policy_url` in the metadata to the extension's actual published policy URL after confirming it. No URL was invented or deployed in this pack.

The account owner should confirm the store's current privacy declarations against the packaged release before submitting.
