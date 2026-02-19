# Changelog

## [2.3.3](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.3.2...v2.3.3) (2026-02-16)


### Bug Fixes

* prevent duplicate friend logs on Firefox ([#50](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/50)) ([f28d337](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/f28d337f315170e220a0c77921faf8fa0c34cb0d))

## [2.3.2](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.3.1...v2.3.2) (2026-02-15)


### Bug Fixes

* extension stops working after first use on Brave/Linux ([#46](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/46)) ([77ffb4f](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/77ffb4f6ed5aabd4ac6f653072fb0e6b4bb2a255))

## [2.3.1](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.3.0...v2.3.1) (2026-02-09)


### Bug Fixes

* correct Opera Add-ons store URL ([#40](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/40)) ([57f88ad](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/57f88ad76972c9e3065977c3823f8d3d7079476f))

## [2.3.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.2.0...v2.3.0) (2026-02-01)


### Features

* display extension version in popup footer ([#34](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/34)) ([d7bc75f](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/d7bc75f1880e161ef91c2c430f89096cd1b73aa7))


### Bug Fixes

* show personal log when no friends' logs exist ([#32](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/32)) ([2662145](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/2662145b1dea83bf6245a20c58c9bebfc8939a77))

## [2.2.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.1.1...v2.2.0) (2026-01-29)


### Features

* add Firefox, Opera, and Edge browser support ([#26](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/26)) ([2324e81](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/2324e8155a49b74fbf5d12f4374ed6b1b3f0cb4c))

## [2.1.1](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.1.0...v2.1.1) (2026-01-25)


### Bug Fixes

* add build-time version sync for manifest.json ([#25](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/25)) ([5ded90e](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/5ded90eb7fa15459147dbecd9060171a6c774e7c))
* sync manifest.json version with package.json ([#23](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/23)) ([cbc3c5e](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/cbc3c5eb2dff8f2f95b6267e8afc4fdaadeec80e))

## [2.1.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.0.1...v2.1.0) (2026-01-25)


### Features

* modernize popup UI with toggle switches and cleaner design ([#20](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/20)) ([05b1c0a](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/05b1c0a4dd7adf9c3e0da70cc60f9ff965092a45))

## [2.0.1](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v2.0.0...v2.0.1) (2026-01-25)


### Bug Fixes

* enable glob for Chrome Web Store upload path ([#16](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/issues/16)) ([3e9cb59](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/3e9cb595e67a7946e930bf37525c5c5c7eac27ad))

## [2.0.0](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/compare/v1.0.1...v2.0.0) (2026-01-25)


### ⚠ BREAKING CHANGES

* Converted to trunk-based development on main branch

### Features

* modernize build system and CI/CD pipeline ([ee6a4c5](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/ee6a4c56b1a951cdeeabaa07b3c8d643913578c2))
* modernize build system and CI/CD pipeline ([ee6a4c5](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/ee6a4c56b1a951cdeeabaa07b3c8d643913578c2))
* modernize build system and CI/CD pipeline ([13b7c99](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/commit/13b7c99d2cf93557d9c474c67f5238281965f19a))

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
