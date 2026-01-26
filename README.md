# Geocaching.com Friends Logs

[![CI](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/bgildcbomgimjfoblhlhmaehaeieeaam)](https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A browser extension for Chrome, Firefox, and Opera that displays your friends' geocaching logs at the top of every cache listing page. Never scroll through hundreds of logs again — instantly see which friends have visited a cache and what they thought about it.

![Example Screenshot](.github/screenshot.png)

## Features

- **Friends logs first** — Your friends' logs appear at the top of cache pages
- **Your own logs** — Optionally display your own logs separately
- **Configurable limits** — Choose to show 5, 10, 20, 50, or 100 friend logs
- **Clean design** — Matches the native Geocaching.com interface
- **Privacy-focused** — No data collection, all preferences stored locally

## Installation

### Chrome

Install directly from the [Chrome Web Store](https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam).

### Firefox

Install directly from [Firefox Add-ons](https://addons.mozilla.org/) (link will be updated when published).

### Opera

Opera users can install the extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam) as Opera supports Chrome extensions.

### Manual Installation

1. Download the latest release for your browser from the [Releases page](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/releases)
2. Unzip the file
3. **For Chrome/Opera:**
   - Open your browser and navigate to `chrome://extensions` (Chrome) or `opera://extensions` (Opera)
   - Enable "Developer mode" (toggle in top right)
   - Click "Load unpacked" and select the unzipped folder
4. **For Firefox:**
   - Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the unzipped folder

## Usage

1. Visit any geocache page on [Geocaching.com](https://www.geocaching.com)
2. Your friends' logs will automatically appear at the top of the logs section
3. Click the extension icon to customize settings:
   - Toggle your own logs visibility
   - Toggle friends logs visibility
   - Set the maximum number of friend logs to display

## Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
# Clone the repository
git clone https://github.com/rfsbraz/Geocaching.com-Friends-Logs.git
cd Geocaching.com-Friends-Logs

# Install dependencies
npm install
```

### Commands

```bash
# Run linting
npm run lint

# Fix linting issues
npm run lint:fix

# Check formatting
npm run format:check

# Fix formatting
npm run format

# Validate build
npm run build

# Create extension zip
npm run build:zip
```

### Loading for Development

1. Run `npm run build` to validate the extension
2. **For Chrome/Opera:**
   - Open `chrome://extensions` (Chrome) or `opera://extensions` (Opera)
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project folder
   - Make changes and click the refresh icon on the extension card to reload
3. **For Firefox:**
   - Open `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the project folder
   - Make changes and click the "Reload" button to reload the extension

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [iCheck](http://icheck.fronteed.com/) for the checkbox styling
- All the geocachers who provided feedback and feature requests
