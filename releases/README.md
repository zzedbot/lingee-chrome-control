# Packaged Chrome extension

## Lingee Chrome Agent Bridge 0.1.26

- Package: `lingee-chrome-agent-bridge-0.1.26.crx`
- Format: CRX3
- Extension ID: `haibmamedieblhbonifchcedcbbfgini`
- SHA-256: `5241a54a5dc6bb5501d6deb0634bb9530204b0ae6fd3f62247e8681ce0655927`

The CRX contains only the Chrome extension. Install the Native Messaging Host separately with the Skill's `scripts/install-host.mjs`, passing the extension ID above. Chrome Web Store or managed enterprise policy is recommended for normal Windows/macOS distribution because Chrome restricts external CRX installation.

The signing private key is deliberately excluded from Git. Future packages for this extension ID must use the original private key; generating another key changes the extension ID and requires Native Host re-registration.
