# Firefox Add-ons (AMO) release notes and previews

Every release publishes to AMO from `.github/workflows/release.yml`, job `publish-to-firefox`:

1. `wdzeng/firefox-addon` uploads `dist/*-firefox.zip` as a new version.
2. `scripts/amo-release.js --apply` then calls the AMO API with the same key (`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`):
   - Release notes: the `CHANGELOG.md` section for the version in `package.json` is sent as the en-US release notes of that version, as plain text (links and commit hashes removed). If AMO has not created the version yet, the script retries for up to 5 minutes.
   - Previews: every `store-listing/assets/screenshot-N.png` is uploaded in numeric order (`screenshot-1.png` first). Only after all uploads succeed are the previews that were there before deleted, so the listing never ends up without screenshots. Icons and promo tiles in the same folder are not previews. AMO recommends 1280x800 PNGs.

To change the AMO screenshots, replace or add `screenshot-N.png` files and release. To change the notes, edit the commit messages before the release PR merges, or edit `CHANGELOG.md` in the release PR.

## Dry run

```bash
node scripts/amo-release.js                    # current package.json version
node scripts/amo-release.js --version 2.4.0    # any version in CHANGELOG.md
```

It prints the release notes payload, the previews it would upload and the ids of the previews on AMO now that it would delete. It sends nothing; the only request is a read of the public listing. No credentials are needed. The script never prints the AMO key.

If the step fails in a release, the version itself is already uploaded. Fix the cause and set the notes by hand in the AMO Developer Hub, or run the script with `--apply` and the AMO key in the environment.
