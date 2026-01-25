# Geocaching.com Friends Logs

[![CI](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/actions/workflows/ci.yml/badge.svg)](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/actions/workflows/ci.yml)
[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/bgildcbomgimjfoblhlhmaehaeieeaam)](https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Chrome extension that displays your friends' geocaching logs at the top of every cache listing page. Never scroll through hundreds of logs again — instantly see which friends have visited a cache and what they thought about it.

![Example Screenshot](.github/screenshot.png)

## Features

- **Friends logs first** — Your friends' logs appear at the top of cache pages
- **Your own logs** — Optionally display your own logs separately
- **Configurable limits** — Choose to show 5, 10, 20, 50, or 100 friend logs
- **Clean design** — Matches the native Geocaching.com interface
- **Privacy-focused** — No data collection, all preferences stored locally

## Installation

### Chrome Web Store (Recommended)

Install directly from the [Chrome Web Store](https://chrome.google.com/webstore/detail/geocachingcom-friends-log/bgildcbomgimjfoblhlhmaehaeieeaam).

### Manual Installation

1. Download the latest release from the [Releases page](https://github.com/rfsbraz/Geocaching.com-Friends-Logs/releases)
2. Unzip the file
3. Open Chrome and navigate to `chrome://extensions`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the unzipped folder

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
2. Open `chrome://extensions` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select the project folder
5. Make changes and click the refresh icon on the extension card to reload

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on how to submit pull requests.

## Security

For security concerns, please see our [Security Policy](SECURITY.md).

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [iCheck](http://icheck.fronteed.com/) for the checkbox styling
- All the geocachers who provided feedback and feature requests
