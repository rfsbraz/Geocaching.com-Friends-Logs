# Contributing to Geocaching.com Friends Logs

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

1. Run `npm run build` to validate the extension
2. Load the extension in your browser (see README for instructions)
3. Test your changes on various geocache pages
4. Verify the popup settings work correctly

## Submitting a Pull Request

1. Ensure all checks pass (`npm run lint && npm run format:check && npm run build`)
2. Push your branch to your fork
3. Open a Pull Request against the `main` branch
4. Fill out the PR template with a clear description of changes
5. Wait for review and address any feedback

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
