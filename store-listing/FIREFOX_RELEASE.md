# Firefox Add-ons (AMO) release notes and previews

Every release publishes to AMO from `.github/workflows/release.yml`, job `publish-to-firefox`:

1. `scripts/amo-release.js --check-version` asks AMO whether it already has the version. If it does (a rerun), the upload is skipped.
2. `wdzeng/firefox-addon` uploads `dist/*-firefox.zip` as a new version. If the upload fails, the job goes on only when AMO has the version anyway (for example a 409 "Version X already exists"); otherwise it fails.
3. `scripts/amo-release.js --apply` then calls the AMO API with the same key (`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`):
   - Release notes: the `CHANGELOG.md` section for the version in `package.json` is sent as the en-US release notes of that version, as plain text (links and commit hashes removed). If AMO has not created the version yet, the script retries for up to 5 minutes.
   - Previews: AMO is made to match `store-listing/assets/screenshot-N.png` exactly, in numeric order (`screenshot-1.png` first). The script compares decoded pixels, since AMO re-encodes uploads. Screenshots AMO lacks are uploaded first, then AMO previews the repo lacks are deleted and positions are fixed, so the listing never ends up without screenshots and a rerun only changes what still differs. Icons and promo tiles in the same folder are not previews. AMO recommends 1280x800 PNGs.
   - Rate limits: every AMO request that gets a 429 waits and retries, using Retry-After when AMO sends it and an exponential back-off otherwise.

To change the AMO screenshots, replace or add `screenshot-N.png` files and release. To change the notes, edit the commit messages before the release PR merges, or edit `CHANGELOG.md` in the release PR.

## Dry run

```bash
node scripts/amo-release.js                    # current package.json version
node scripts/amo-release.js --version 2.4.0    # any version in CHANGELOG.md
```

It prints the release notes payload and the preview sync: the screenshots it would upload, the AMO previews it would delete and any position changes. It sends nothing; the only requests are reads of the public listing and its preview images. No credentials are needed. The script never prints the AMO key.

If the step fails in a release, the version itself is already uploaded. Republish to Firefox only: Actions > Release > Run workflow, with `tag` set to the release tag (for example `v2.5.0`) and `stores` set to `firefox`. The job skips the upload and syncs the notes and previews again, and Chrome and Edge are not resubmitted, so a version in review there keeps its place. Rerunning the failed job of the old run is not the same: it reruns the workflow as it was then.

`stores` takes `all` (the default) or a comma list of `chrome`, `edge` and `firefox`. A release from a push always publishes to all three.

### Finishing 2.5.0

Once this is on `main`, to finish 2.5.0 on Firefox (delete the stale preview 349679): Actions > Release > Run workflow on `main`, `tag` = `v2.5.0`, `stores` = `firefox`.
