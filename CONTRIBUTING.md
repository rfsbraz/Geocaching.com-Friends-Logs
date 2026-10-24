# Contributing to Geocaching Friends Logs

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/Geocaching.com-Friends-Logs.git`
3. Install dependencies: `npm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Code Style

This project uses ESLint and Prettier for code formatting. Before submitting a PR:

```bash
# Check for linting errors
npm run lint

# Fix linting errors
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format
```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages:

- `feat:` — New features
- `fix:` — Bug fixes
- `docs:` — Documentation changes
- `chore:` — Maintenance tasks
- `refactor:` — Code refactoring
- `test:` — Test additions or modifications

Examples:
```
feat: add option to sort friends logs by date
fix: resolve issue with logs not loading on certain cache pages
docs: update installation instructions
```

### Testing Changes

```bash
# Run unit tests
npm test

# Validate the build
npm run build

# Check the live geocaching.com page still matches what inject.js expects
node scripts/check-site-contract.js [cache-page-url]
```

To test the extension in your browser:

1. Run `npm run build` to validate the extension
2. Load the extension in your browser:
   - **Chrome/Edge/Opera/Brave**: Open the extensions page (`chrome://extensions`, `edge://extensions`, etc.), enable "Developer mode", click "Load unpacked", and select the project folder
   - **Firefox**: Open `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", and select `manifest.json`
3. Test your changes on various geocache pages
4. Verify the popup settings work correctly

## Store listing text

The store listing text for every store and language lives in `store-listing/listing.json` and `store-listing/locales/<id>.json`. See `store-listing/README.md` for the format. After changing it, run `npm run store-listing:build` to regenerate `store-listing/CHROME_UPDATE.md`; `npm test` fails if the listing breaks a store limit or no longer matches `_locales`.

## Store credentials check

`.github/workflows/store-credentials.yml` runs every Monday and on demand (Actions > Store credentials > Run workflow). It runs `scripts/check-store-credentials.sh`, which only reads from the stores:

- Chrome: exchanges `CHROME_REFRESH_TOKEN` for an access token with `CHROME_CLIENT_ID` and `CHROME_CLIENT_SECRET`, then reads item `bgildcbomgimjfoblhlhmaehaeieeaam`. The weekly exchange keeps the refresh token in use. `invalid_grant` means the token expired or was revoked: create a new one and update the secret.
- Chrome API version: the check uses the V1.1 API, like the publish action, unless the repository variable `CHROME_PUBLISHER_ID` is set. Then it uses the V2 `fetchStatus` call. Google ends V1.1 on 2026-10-15, so set the variable. The publisher ID is in the Developer Dashboard under Publisher > Settings.
- Edge: calls the Add-ons API with `EDGE_CLIENT_ID`, `EDGE_API_KEY` and `EDGE_PRODUCT_ID`. The API has no plain product read, so it asks for an operation that does not exist. 404 means the key was accepted. 401 or 403 means it was rejected. A 404 would also hide a wrong product id.
- Edge key expiry: `EDGE_API_KEY_EXPIRES` at the top of the workflow. Within 30 days of that date the run adds a warning. After it, the run fails. When you create a new key, update both the secret and this date.

The script prints only status codes and error codes, never tokens or response bodies.

On a failure or an expiry warning, the workflow comments on the open issue titled "Store credentials need renewal", or creates it. When a later run passes with no warnings, it closes that issue with a comment.

GitHub disables scheduled workflows after 60 days without repository activity. The `keepalive` job calls the API to enable the workflow on every run, which resets that timer without commits. If the workflow still ends up disabled, enable it again under Actions > Store credentials.

To test locally with fake values, export the secrets above plus `EDGE_API_KEY_EXPIRES=2026-12-24` and run `./scripts/check-store-credentials.sh`. It should fail with status codes only.

## Submitting a Pull Request

1. Ensure all checks pass (`npm run lint && npm run format:check && npm run build`)
2. Push your branch to your fork
3. Open a Pull Request against the `main` branch
4. Fill out the PR template, including the AI use section
5. Wait for review and address any feedback

## Low-effort and automated PRs

Geocaching Friends Logs is maintained in my spare time, and every PR takes real time to review. I'm happy to get contributions from people who use Geocaching Friends Logs and want to make it better.

I will close, without review, PRs that look like contribution farming: accounts opening many PRs across unrelated projects, or changes made mainly to collect contributions rather than to fix something you ran into. This applies even when the change itself is correct.

AI-assisted PRs are fine if you've read and understood the change and can answer questions about it. Please say so in the PR.

The easiest way to get a PR merged is to start with an issue, agree on the approach there, and then open the PR.

## Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Reporting Issues

When reporting bugs, please include:

- Browser version
- Extension version
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots if applicable

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Questions?

Feel free to open an issue for any questions about contributing.
