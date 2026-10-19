# Edge Add-ons notes for certification

Every release submits to Edge Add-ons from `.github/workflows/release.yml`, job `publish-to-edge`. Microsoft reviewers read the "notes for certification" sent with each submission. Only they see them; they are not shown on the listing.

The job builds the notes with `scripts/edge-cert-notes.js --github-output` and passes them to `wdzeng/edge-addon` as `notes-for-certification`. The notes are:

1. The testing steps in `store-listing/edge-certification-notes.txt`: what the extension does and how to see it work. Edit that file when the steps change.
2. `Changes in <version>:` followed by the `CHANGELOG.md` section for the version in `package.json`, as plain text (links and commit hashes removed).

The step fails if `CHANGELOG.md` has no section for the version, so a submission never goes out with empty notes. Notes over 2000 characters keep the testing steps whole and cut the list of changes, ending with a pointer to `CHANGELOG.md`.

The notes contain no credentials. If reviewers ever need a test account, do not add it to the template file, which is public. Store it as a secret and add it in the workflow step instead.

## Dry run

```bash
node scripts/edge-cert-notes.js                    # current package.json version
node scripts/edge-cert-notes.js --version 2.4.0    # any version in CHANGELOG.md
```

It prints the notes and their length. It sends nothing and needs no credentials.
