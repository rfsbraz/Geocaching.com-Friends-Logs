# Changelog

## [2.0.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v1.0.1...v2.0.0) (2025-01-24)

### ⚠ BREAKING CHANGES

* Migrated to Manifest V3 (Chrome extension API changes)

### Features

* Updated URL patterns to match new geocaching.com page structure
* Added error handling for missing page dependencies
* Added support for `decryptLogs` not being present on page

### Bug Fixes

* Fixed HTTPS for Google Fonts in popup
* Fixed string boolean comparisons in storage handling

### Code Refactoring

* Modernized JavaScript with const/let and arrow functions
* Extracted DEFAULT_VALUES to shared constants
* Added JSDoc comments for better code documentation
* Wrapped inject.js in IIFE for proper scoping

### Miscellaneous

* Added ESLint and Prettier for code quality
* Added npm scripts for linting and building
* Added GitHub Actions CI/CD pipelines
* Added release-please for automated versioning

## [1.0.1](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/releases/tag/v1.0.1)

* Updated for the new page urls

## [1.0.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/releases/tag/v1.0.0)

* Added iCheck for prettier checkboxes
* Added jQuery
* Started converting ugly old methods to jQuery functions

## [0.0.2](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/releases/tag/v0.0.2)

* Initial release
