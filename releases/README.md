# Packaged browser extension

## Lingee Browser Agent Bridge 0.2.2

- Package: `lingee-browser-agent-bridge-0.2.2.crx`
- Format: CRX3
- Extension ID: `haibmamedieblhbonifchcedcbbfgini`
- SHA-256: `9e8345637083a32a5e27fe0684e5d56a7218787c8b324b9f3ecb1859eaf31781`

This release adds pre-action transient feedback capture for short-lived Message/Toast/Notification content, document- and mutation-fresh action intents, inferred Kingdee field-label locators, and a Windows CLI contract that requires stdin/file JSON instead of positional inline JSON. The same CRX is the Skill's only extension asset at `assets/lingee-browser-agent-bridge-0.2.2.crx`.

## Lingee Browser Agent Bridge 0.2.1

- Package: `lingee-browser-agent-bridge-0.2.1.crx`
- Format: CRX3
- Extension ID: `haibmamedieblhbonifchcedcbbfgini`
- SHA-256: `fdb0a4c197b71d9cfa0c1a8911cde7e3d99ba63d9fb0d676262f0922ebe704a6`

This release adds bounded locator descriptors/state, generic clickable DOM observation, screenshot-to-file CLI output, CLI self-description, and record lifecycle intent recipes. The same CRX is the Skill's only extension asset at `assets/lingee-browser-agent-bridge-0.2.1.crx`.

## Lingee Browser Agent Bridge 0.2.0

- Package: `lingee-browser-agent-bridge-0.2.0.crx`
- Format: CRX3
- Extension ID: `haibmamedieblhbonifchcedcbbfgini`
- SHA-256: `09869c4a9511163e8fdc88ba1d6c014fdd397f50bc210cab434f04f4ac5abacf`

This is the archived 0.2.0 CRX. The current Skill carries only the newest matching release; the repository keeps unpacked source under `extension/` for development and release verification, but the Skill does not duplicate it.

The CRX contains only the current Chromium adapter extension. Install the Native Messaging Host separately with the Skill's `scripts/install-host.mjs`, passing the extension ID above. For Google Chrome, Chrome Web Store or managed enterprise policy is recommended for normal Windows/macOS distribution because Chrome restricts external CRX installation.

The signing private key is deliberately excluded from Git. Future packages for this extension ID must use the original private key; generating another key changes the extension ID and requires Native Host re-registration.
