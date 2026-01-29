# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email the maintainer directly or use GitHub's private vulnerability reporting
3. Include a detailed description of the vulnerability
4. Provide steps to reproduce if possible

You can expect:

- Acknowledgment within 48 hours
- Regular updates on the fix progress
- Credit in the release notes (unless you prefer anonymity)

## Security Measures

This extension follows security best practices:

- **Minimal permissions** — Only requests `storage` permission and access to geocaching.com
- **No remote code** — All JavaScript is bundled within the extension
- **No data collection** — User preferences are stored locally only
- **No external requests** — The extension does not communicate with any external servers
- **Content Security Policy** — Follows Manifest V3 security requirements

## Scope

Security issues we're interested in:

- Cross-site scripting (XSS) vulnerabilities
- Data leakage or privacy issues
- Permission escalation
- Code injection vulnerabilities

Out of scope:

- Issues requiring physical access to the device
- Social engineering attacks
- Issues in dependencies (please report to the respective projects)
