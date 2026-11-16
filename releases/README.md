# Packaged Chrome extension

## Lingee Chrome Agent Bridge 0.1.32

- Package: `lingee-chrome-agent-bridge-0.1.32.crx`
- Format: CRX3
- Extension ID: `haibmamedieblhbonifchcedcbbfgini`
- SHA-256: `d6bc7ca88ccd4b992cb5b99dff09c2d9f1db2a8d666465d31a8f5c6af10bff22`

The same CRX is bundled in the Skill at `assets/lingee-chrome-agent-bridge-0.1.32.crx`. Its ZIP payload was extracted and compared file-by-file with the unpacked `extension/` source before packaging.

The CRX contains only the Chrome extension. Install the Native Messaging Host separately with the Skill's `scripts/install-host.mjs`, passing the extension ID above. Chrome Web Store or managed enterprise policy is recommended for normal Windows/macOS distribution because Chrome restricts external CRX installation.

The signing private key is deliberately excluded from Git. Future packages for this extension ID must use the original private key; generating another key changes the extension ID and requires Native Host re-registration.
