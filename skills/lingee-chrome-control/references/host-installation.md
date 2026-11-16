# Native Host installation

The Skill ships a lightweight Windows Native Messaging Host, but it does not embed or download Node.js. Chrome starts a small launcher, and the launcher runs the bundled Host script with the exact system Node.js executable that was validated during installation.

## Requirements

- Windows 10 or Windows 11.
- Microsoft .NET Framework 4.x runtime for the small launcher (normally included and serviced with supported Windows versions).
- Node.js 22 or newer. A current 64-bit Node.js LTS release is recommended.
- Chrome with the bundled unpacked extension or signed CRX installed.
- The 32-character extension ID shown by `chrome://extensions`.
- Per-user registry access. Administrator rights are not required.

Verify the runtime before installation:

```powershell
node --version
node -p "process.execPath"
```

Run the installer with the same `node` command that the Host should keep using. The installer records its resolved absolute executable path, so later PATH changes do not silently select another runtime.

## Included Host files

- `assets/native-host/native-host-launcher.exe`: a small Windows launcher registered with Chrome Native Messaging.
- `assets/native-host/native-host.cjs`: the bundled Host application.

The package contains no `node.exe`, npm dependency tree, or standalone Node runtime. The target machine does not need to run `npm install` or have the source repository.

## Install

1. Install or reload the extension and copy its exact ID from `chrome://extensions`.
2. Confirm Node.js 22+ with `node --version`.
3. Perform a read-only preview:

   ```powershell
   node "<skill-root>/scripts/install-host.mjs" --extension-id <id> --dry-run
   ```

4. Review the JSON output. Confirm `runtime` is `system-node`, `nodePath` is the intended Node installation, `nodeVersion` is 22 or newer, and the extension ID is correct.
5. Only after explicit installation approval, repeat without `--dry-run`:

   ```powershell
   node "<skill-root>/scripts/install-host.mjs" --extension-id <id>
   ```

6. Restart Chrome or reload the extension, then run:

   ```powershell
   node "<skill-root>/scripts/preflight.mjs"
   ```

The installer writes a versioned directory below `%LOCALAPPDATA%\UniversalBrowserBridge\bin`, containing the launcher, Host script, and `node-path.txt`. It also writes the per-user Native Messaging manifest and registers `org.universal_browser.bridge` under `HKCU`. Existing browser policy is preserved.

## Node.js upgrades or relocation

If Node.js is moved, removed, or replaced, run the installer again using the desired Node.js 22+ executable. This updates `node-path.txt` and the Native Messaging registration without embedding Node. A missing recorded runtime causes the launcher to fail closed instead of falling back to an arbitrary PATH entry.

## Uninstall

Only with explicit removal approval, run:

```powershell
node "<skill-root>/scripts/uninstall-host.mjs"
```

This removes the per-user Host registration and runtime files while preserving browser policy.

## Common failures

- `NODE_VERSION_UNSUPPORTED`: install or select Node.js 22+, then rerun the installer with that `node` command.
- `HOST_HASH_MISMATCH`: the copied launcher, Host script, or recorded Node path differs from the validated installation; reinstall from an intact Skill package.
- The launcher reports that the configured Node executable is missing: reinstall Node at the recorded location or rerun the installer with the new Node executable.
- Chrome reports a forbidden or missing Native Messaging Host: verify the extension ID passed to the installer, then restart Chrome and reload the extension.

The installer never downloads a runtime, requests administrator elevation, or modifies machine-wide Native Messaging registration.
