# Capability catalog

This catalog describes the supported standard surface. Use `tools.md` for exact schemas and `examples.md` for end-to-end command sequences. Every capability is available through equivalent MCP and bundled CLI forms; raw CDP and page JavaScript are not standard alternatives.

## Setup and health

- Discover one or more running Bridge instances without exposing endpoints or authentication tokens.
- Diagnose Node.js, bundled client, runtime descriptor, local-pipe reachability, and extension handshake with `doctor.mjs`.
- Verify Host/extension version parity, compatibility markers, declared capabilities, and policy gate counts with `preflight.mjs`.
- Install the bundled lightweight Windows Native Host per user, using the exact Chrome extension ID and an existing Node.js 22+ runtime, without needing the source repository or `npm install`.
- Load or update the complete unpacked Chrome extension bundled under `assets/chrome-extension`.

## Policy and metadata boundaries

- Read the effective allowlist, blocklist, global site gate, sensitive-metadata gate, and internal CDP allowlist.
- Allow or block one exact HTTP(S) host and its subdomains; the blocklist always wins.
- Enable global site access or sensitive history/bookmark/download metadata only after explicit approval.
- Enable session clipboard read and write independently, only after explicit approval for the exact transfer.
- Never read cookies, passwords, Local Storage, Session Storage, profiles, descriptor tokens, or raw remote object handles.

## Tabs, navigation, and lifecycle

- List, inspect, open, activate, close, group, navigate, go back/forward, and reload approved tabs.
- Claim and detach debugger-backed control while maintaining visible pointer state.
- Wait for URL patterns and `commit`, `domcontentloaded`, `load`, or bounded `networkidle` states.
- Register a navigation expectation before a click, key press, direct navigation, history traversal, or reload.
- Distinguish user tabs from API-created or click-created temporary tabs.
- Preserve intentional output with handoff/deliverable markers; end a session by releasing leases and cleaning only safe unmarked temporary tabs.

## Observation and locators

- Read bounded visible text, compact interactive DOM snapshots, accessibility trees, and screenshots.
- Create a 30-second screenshot observation bound to tab, document, viewport/layout, normalized DOM/layout evidence, and operation sequence. Lingee's own cursor overlay is excluded from that evidence; only viewport PNG observations authorize coordinate input.
- Locate by CSS, role/name, label, text, test ID, and exact-match semantics.
- Count matches; read bounded `innerText`, `textContent`, attributes, and all text contents; test visibility and enabled state.
- Fail closed for absent, ambiguous, oversized, hidden, disabled, stale, or document-replaced targets.
- Wait for attached, detached, visible, hidden, enabled, or disabled element states.

## Viewport and responsive testing

- Read the current CSS viewport, page offset, scale, and active emulation profile.
- Set bounded desktop, tablet, or mobile viewport dimensions from 320×240 through 3840×2160, with device scale from 0.5 through 4.
- Recalibrate screenshots, viewport coordinates, and the visible virtual pointer immediately after every change.
- Reset temporary viewport overrides automatically at session end. Preserve an override only when the user explicitly requests `preserveOnSessionEnd`.

## Frames

- Resolve an ordered outer-to-inner `framePath` for same-origin, cross-origin/OOPIF, and nested Frames.
- Apply locators, reads, waits, clicks, form controls, keyboard input, downloads, and uploads inside a Frame.
- Detect Frame navigation, removal, inaccessible targets, and stale isolated contexts instead of silently falling back to the top document.

## Forms and keyboard

- Click, fill, press one key or shortcut, type text, and type sequentially with delay and total timeout.
- Check, uncheck, or set explicit checkbox/radio state and verify the final value.
- Select native options by value, label, index, or multiple-selection array and verify values/labels.
- Double-click with two real press/release sequences and synchronized visible feedback.
- Reject incompatible element types, hidden/disabled controls, invalid radio uncheck, missing options, and final-value mismatches.

## Visible pointer and scrolling

- Initialize a persistent top-layer virtual pointer at the viewport center when control starts.
- Animate pointer movement with a visible arrival pause, then dispatch actual browser input only after the overlay has painted and its position is verified.
- Click elements or reviewed coordinates, drag between locators/points, dispatch wheel input, and scroll by CSS pixels.
- Keep movement, click, drag, wheel, and scroll animation strongly bound to the corresponding real input; rendering, document, or control loss fails closed.
- Prefer semantic locators. Mouse move, coordinate click, drag, wheel, and scroll require the single-use `observationId` from an immediately preceding viewport PNG. Revalidation happens before animation or input, and the result shares one operation sequence with both.

## Dialogs, downloads, and files

- Detect JavaScript alert/confirm/prompt dialogs, read their ID/type/message, and accept or dismiss the current ID after any required confirmation.
- Register a download expectation before the triggering action; return state, suggested filename, size, source, and local path without executing the file.
- Download only an explicit locator-backed media target allowed by site policy.
- Capture dynamic or hidden file choosers, then assign validated absolute regular-file paths with multiplicity checks through a confirmed upload intent.
- Retain the CSS file-input compatibility path for explicit file input selectors and optional Frame paths, also behind the upload-intent gate.

## Consequential action intents

- Prepare exact, short-lived intents for upload, message send, deletion, payment, permission change, login, and browser permission actions.
- Return machine-readable risk class, exact target origin, summary, data types, expiry, and confirmation state without executing the action.
- Confirm or reject only after the user decides; execute a confirmed intent once. Exact-scope remembrance is session-only and is erased at session end.
- The Host hard-gates all upload methods. For other business semantics that a generic click cannot reveal, the Skill/caller must declare the intent before executing the exact nested action.

## Sessions and concurrency

- Keep one stable non-secret session ID per task and isolate ownership across concurrent clients.
- Allow shared read-only inspection while enforcing exclusive ownership for tab mutations.
- Read lease state without revealing another session ID, renew ownership through activity, and transfer only to an explicit target session.
- Prevent non-owners from navigation, close, detach, input, or lifecycle mutation.

## Browser session clipboard

- Store clipboard entries only in bounded Native Host memory for the current non-secret session ID; never access the operating-system or Chrome global clipboard.
- Read and write are separate policy gates. Clearing uses the write gate, and session end or expiry erases content automatically.
- Support UTF-8 `text/plain`, `text/markdown`, and `text/html`, plus canonical Base64 `image/png` with signature validation.
- Allow at most four unique MIME entries and 256 KiB total. Reject duplicate, unknown, malformed, or oversized entries before storage.
- Treat HTML as inert text and PNG as opaque bytes. The Bridge does not render, execute, paste, or inspect clipboard content automatically.

## Events, logs, and sensitive browser metadata

- Read bounded debugger lifecycle events using sequence cursors, method filters, pagination, and truncation flags.
- Read structured console log/debug/info/warning/error entries with level/text filters and sanitized source URLs.
- Search history, bookmarks, or download metadata only while the explicit sensitive-metadata gate is enabled.

## Current-document resource export

- `browser.listObservedResources` returns a bounded inventory from the approved top-level document only. Optional type and MIME filters reduce the result; every `resourceId` expires when that document navigates.
- `browser.exportObservedResources` accepts one to twenty reviewed IDs and writes a ZIP containing at most 4 MiB per resource and 8 MiB total, plus `manifest.json`.
- The archive is session-temporary and is removed by `browser.endSession`, expiry, or Host shutdown. Copy or deliver it before ending the session when the user asked to keep it.
- There is no arbitrary URL, request-header, cookie, page-script, or raw-CDP escape hatch. Never use hidden endpoints to bypass access controls.

## Current compatibility contract

The bundled version expects Host and extension `0.1.32` plus these compatibility markers:

- `foreignFrameMonitor: remove-after-blank-v11`
- `debuggerState: generation-v4`
- `monitorDiagnostics: counts-v2`
- `virtualCursor: overlay-v13`
- `pointerInput: bounded-pointer-v3`
- `dialogHandling: codex-lifecycle-v3`
- `locatorQueries: codex-read-v1`
- `formControls: verified-fill-v3`
- `frameLocators: isolated-world-v1`
- `navigationWaits: navigation-v1`
- `highLevelLifecycle: codex-lifecycle-v1`
- `sessionClipboard: host-memory-v1`
- `viewportEmulation: viewport-v1`
- `observedResourceExport: resource-export-v1`
- `actionIntents: action-intent-v1`
- `observationFreshness: observation-v1`

Run `node "<skill-root>/scripts/preflight.mjs"` after installation, extension reload, or Host update. A future release should update this contract and the bundled components together.
