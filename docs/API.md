# API

All direct bridge calls use JSON-RPC 2.0 semantics. The client library adds the descriptor's authentication token automatically.

## Bridge

| Method | Purpose |
|---|---|
| `bridge.getInfo` | Host, transport, instance, and extension handshake status |

## Policy

| Method | Parameters | Purpose |
|---|---|---|
| `policy.get` | — | Read effective policy |
| `policy.allowHost` | `host` | Allow a host and its subdomains |
| `policy.blockHost` | `host` | Block a host and its subdomains |
| `policy.setAllowAll` | `enabled` | Toggle global site access |
| `policy.setSensitiveMetadata` | `enabled` | Toggle history/bookmark/download metadata |
| `policy.setSessionClipboardRead` | `enabled` | Independently allow or deny reading the current session's memory-only clipboard |
| `policy.setSessionClipboardWrite` | `enabled` | Independently allow or deny writing/clearing the current session's memory-only clipboard |
| `policy.allowCdpMethod` | `command` | Add one raw CDP method to the allowlist |

The blocklist always takes precedence over the allowlist and `allowAll`.

## Browser lifecycle and tabs

| Method | Required parameters |
|---|---|
| `browser.getInfo` | —; returns backend identity, capabilities, compatibility markers, and optional history/bookmark permission booleans |
| `browser.listTabs` | — |
| `browser.getTab` | `tabId` |
| `browser.openTab` | `url` |
| `browser.closeTab` | `tabId` |
| `browser.activateTab` | `tabId` |
| `browser.claimTab` | `tabId` |
| `browser.detachTab` | `tabId` |
| `browser.navigate` | `tabId`, `url` |
| `browser.back` | `tabId` |
| `browser.forward` | `tabId` |
| `browser.reload` | `tabId` |
| `browser.groupTabs` | `tabIds` |

Unapproved entries returned by `browser.listTabs` and `browser.getTab` are redacted to basic structural metadata and hostname.

## Page observation

| Method | Required parameters | Result |
|---|---|---|
| `browser.readText` | `tabId` | URL, title, visible body text |
| `browser.domSnapshot` | `tabId` | Compact interactive-node snapshot |
| `browser.locatorDescribeAll` | `tabId`, `locator`; optional `framePath`, bounds | Bounded descriptors for all matches, including field label/value/state and stable attributes |
| `browser.locatorState` | `tabId`, `locator`; optional `framePath`, text bound | One unique element's current semantic, form, visibility and geometry state |
| `browser.locatorCount` | `tabId`, `locator` | Number of matching elements, including hidden elements |
| `browser.locatorAllTextContents` | `tabId`, `locator` | Bounded text-content array for all matches |
| `browser.locatorInnerText` | `tabId`, `locator` | Bounded rendered text from one unique match |
| `browser.locatorTextContent` | `tabId`, `locator` | Bounded text content from one unique match |
| `browser.locatorGetAttribute` | `tabId`, `locator`, `name` | Bounded attribute value from one unique match |
| `browser.locatorIsVisible` | `tabId`, `locator` | Current visibility, or false when absent |
| `browser.locatorIsEnabled` | `tabId`, `locator` | Current enabled state, or false when absent |
| `browser.waitFor` | `tabId`, `locator`, `state` | Bounded wait for attached, detached, visible, hidden, enabled, or disabled |
| `browser.waitForURL` | `tabId`, `url` | Exact, contains, or glob URL wait with optional load-state gate |
| `browser.waitForLoadState` | `tabId`, `state` | Wait for commit, DOM content, load, or bounded network idle |
| `browser.expectNavigation` | `tabId`, `action` | Run a reviewed high-level action after registering its navigation expectation |
| `browser.performAndWaitForFeedback` | `tabId`, click `action`, expected `text` | Register a bounded DOM observer before the visible action and return the first matching transient feedback even if it later disappears |
| `browser.check` / `browser.uncheck` / `browser.setChecked` | `tabId`, `locator` | Set and verify native checkbox/radio state with visible input |
| `browser.selectOption` | `tabId`, `locator`, `options` | Select native options by value, label, or index and verify values |
| `browser.doubleClick` / `browser.pressSequentially` | `tabId`, `locator` | Strongly bound double click or bounded character-by-character input |
| `browser.waitForDownload` / `browser.downloadMedia` | `tabId`, action or locator | Action-bound completed download with reviewed source URL |
| `browser.waitForFileChooser` / `browser.setFileChooserFiles` | `tabId`, action or chooser ID | Capture a chooser before its action and set validated files |
| `browser.getConsoleLogs` | `tabId` | Filtered bounded structured console entries with sequence cursor |
| `browser.accessibilitySnapshot` | `tabId` | Chrome accessibility tree |
| `browser.screenshot` | `tabId` | Base64 image, MIME type, short-lived observation ID, coordinate-safety flag and operation sequence |
| `browser.getViewport` | `tabId` | Current CSS viewport, offset, scale and emulation state |
| `browser.setViewport` | `tabId`, `width`, `height` | Bounded responsive viewport and recalibrated virtual pointer |
| `browser.resetViewport` | `tabId` | Cleared emulation and restored native viewport state |

## Page interaction

| Method | Required parameters |
|---|---|
| `browser.click` | `tabId`, `locator` |
| `browser.fill` | `tabId`, `locator`, `value` |
| `browser.press` | `tabId`, `key` |
| `browser.type` | `tabId`, `text` |
| `browser.mouseMove` | `tabId`, `observationId`, `x`, `y` |
| `browser.coordinateClick` | `tabId`, `observationId`, `x`, `y` |
| `browser.drag` | `tabId`, `observationId`, `from`, `to` |
| `browser.wheel` | `tabId`, `observationId`, `x`, `y` |
| `browser.scroll` | `tabId`, `observationId` and optional deltas |
| `browser.setFileInput` | A confirmed upload action intent containing `tabId`, `selector`, `files` |
| `browser.getDialog` | `tabId` |
| `browser.handleDialog` | `tabId` and optional `dialogId`, `accept`, `promptText` |

A locator supports `css`, `role` plus `name`, `label`, `text`, or `testId`. Locator queries and click/fill/press/type/drag/file input accept an optional ordered `framePath`, whose entries use the same locator shape to enter nested frames. Each frame document and loader is revalidated before input; removed or navigated frames invalidate old context. Cross-origin frame URLs are independently checked by the Native Host site policy. Pointer locator actions wait up to two seconds for stable half-pixel geometry and choose a point that `elementFromPoint` confirms is the target or its descendant; persistent overlays fail closed with `INPUT_TARGET_OBSCURED`. Input operations require one visible match. Strict read operations reject zero matches and ambiguous matches; `locatorCount` and `locatorAllTextContents` intentionally operate on collections, while the state predicates return false for zero matches. Query operations never scroll, focus, or dispatch input. Collection length and returned text are bounded.

JavaScript dialogs follow the same lifecycle as Codex Browser Use: the extension subscribes before the triggering pointer release, records the dialog as a first-class object, and lets the click return with `dialogOpened` even if Chrome still has the input command pending. Call `browser.getDialog`, then pass its `id` to `browser.handleDialog`. Dialog handling goes directly to the already attached debugger target and waits for `Page.javascriptDialogClosed`; it does not run page scripts or cursor recovery while the modal dialog is open.

Each Bridge client sends a non-secret session ID outside browser method parameters. `browser.claimTab` establishes an exclusive renewable lease; read-only methods remain shareable, while navigation, input, close and detach require ownership. `browser.getLease` never reveals another session ID. `browser.transferTab`, `browser.markHandoff`, `browser.markDeliverable`, and `browser.endSession` implement explicit transfer and cleanup. Tabs opened by the session or by its controlled actions are temporary; marked, user-owned, unsaved, and failed-cleanup tabs are preserved.

Viewport emulation accepts 320–3840 CSS pixels wide, 240–2160 high, device scale 0.5–4, and an optional mobile layout flag. Changes are serialized with tab mutations, recenter and verify the virtual pointer, and affect subsequent screenshots and coordinate input. Overrides reset on `browser.resetViewport` or session end; `preserveOnSessionEnd` is accepted only for an explicit request to retain the responsive profile.

### Screenshot observations and coordinate freshness

A viewport PNG screenshot creates one 30-second `observationId` bound to the exact tab, top-level document, viewport/layout signature, normalized DOM/layout evidence and current operation sequence. `mouseMove`, `coordinateClick`, `drag`, `wheel` and `scroll` require that ID. Before animation or input, the extension recaptures and compares the evidence; navigation, page/layout changes, viewport or window resizing, scrolling, another pointer operation, a newer screenshot, expiry or detach makes the old observation unusable. JPEG and beyond-viewport screenshots are observable but not coordinate-safe.

Every accepted pointer action receives one monotonically increasing `operationSequence`; the visible pointer feedback, actual input and returned result share that sequence. An observation is single-use for coordinate input. On `OBSERVATION_*` failure, re-read semantic state and capture a new viewport PNG rather than retrying stale coordinates.

## Observed page resources

| Method | Parameters | Result |
|---|---|---|
| `browser.listObservedResources` | `tabId`; optional `types`, `mimeTypes`, `maxResults` | Bounded current-document resources with opaque IDs, approved URLs, type, MIME type, size and suggested filename |
| `browser.exportObservedResources` | `tabId`, one to twenty `resourceIds` | Path and metadata for a session-temporary ZIP archive |

Resource IDs are bound to the current top-level document and become invalid after navigation. Only HTTP(S) resources already present in that document's resource tree are eligible; the Host removes unapproved origins. Export accepts IDs only, never an arbitrary URL, and is limited to 4 MiB per resource and 8 MiB total. The ZIP includes a manifest and is deleted by `browser.endSession`, session expiry, or Host shutdown. See [RESOURCE-EXPORT.md](./RESOURCE-EXPORT.md) for platform-specific export boundaries.

## Browser session clipboard

| Method | Parameters | Result |
|---|---|---|
| `browser.sessionClipboardWrite` | `items` | Replaces the current session clipboard and returns MIME/size metadata without echoing content |
| `browser.sessionClipboardRead` | optional `mimeTypes` | Returns the current session's matching typed entries |
| `browser.sessionClipboardClear` | — | Clears current-session entries and reports prior count/size |

This clipboard is Native Host memory keyed by the non-secret Bridge `sessionId`; it never reads or writes the operating-system or Chrome global clipboard and is never persisted. Read and write use independent, default-off policy gates. `browser.endSession`, expiry, or Host shutdown erases its data.

## Consequential action intents

| Method | Parameters | Result |
|---|---|---|
| `browser.prepareActionIntent` | `tabId`, `actionType`, `summary`, exact nested `action`; optional `dataTypes` | A tab/origin/document/action/session-bound intent with risk class, expiry and confirmation state |
| `browser.confirmActionIntent` | `intentId`, `decision`; optional `rememberForSession` | Confirmed or rejected intent state without executing it |
| `browser.executeActionIntent` | `intentId` | The consumed intent and exact high-level action result |

Action types are `upload`, `message-send`, `record-create`, `record-update`, `record-submit`, `delete`, `payment`, `permission-change`, `login`, and `browser-permission`. Risk classes are `reversible-write`, `irreversible-write`, and `sensitive-data-transfer`. Executing a pending intent fails with machine-readable `ACTION_CONFIRMATION_REQUIRED`; confirmed intents are single-use and expire after five minutes. Controlled input, switch clicks, navigation, reload, or document replacement after preparation makes the old intent fail with `ACTION_INTENT_STALE`. An exact scope may be remembered only for the current Bridge session and document and is erased by `browser.endSession` or expiry. File upload methods reject direct calls with `ACTION_INTENT_REQUIRED` and must execute through a confirmed upload intent. Generic page actions whose business meaning cannot be determined by the Host must be routed through this contract by the standard Skill.

`browser.performAndWaitForFeedback` is designed for short-lived Message, Toast, Notification, `role=status`, and `role=alert` content. It installs the observer before the nested visible click and returns bounded text, role/aria-live metadata, appearance time, disappearance state, document ID, and the action result. It is supplementary evidence only; record persistence still requires an ID/status, matching list row, or deliberate reopen/readback.

Each write accepts at most four unique entries and 256 KiB total. The explicit whitelist is UTF-8 `text/plain`, `text/markdown`, `text/html`, and canonical Base64 `image/png`; PNG data must have the correct signature. HTML remains inert data and is never rendered or executed. All other binary MIME types fail closed.

Claiming a tab renders the persistent Precision Glass overlay in its top frame before the first controlled action: a centered `Lingee 正在控制` chip, a short viewport-edge sweep, and a dual-outline pointer centered in the viewport. Clicks add two rings and a center flash, wheel and scroll calls show a directional capsule beside the pointer, and drag shows an origin dot and tether. Navigation rebuilds and recenters the overlay. It has no hit testing, restores itself if its host is removed, and remains visible until `browser.detachTab`. Restricted browser pages may accept CDP input while rejecting overlay injection; in that case the action still runs without the visual pointer.

## Debugging and events

| Method | Required parameters |
|---|---|
| `browser.cdp` | `tabId`, `command` |
| `browser.getEvents` | optional cursor, tab and method filters |

Only CDP methods in `policy.allowedCdpMethods` are accepted. Event results contain `cursor`, `hasMore`, and `truncated` fields.

The `lingee-browser-control` Skill exposes a standard high-level MCP/CLI surface. Its MCP server does not publish `policy_allow_cdp_method` or `browser_cdp`, and its bundled CLI rejects `policy.allowCdpMethod`, `browser.cdp`, unknown methods, and direct CDP method names with `NONSTANDARD_BROWSER_CONTROL_BLOCKED` before connecting to Chrome. The raw Bridge methods remain documented here for non-Skill development and are outside the Skill control contract.

The standard surface has one authoritative registry at `skills/lingee-browser-control/scripts/runtime/standard-capabilities.mjs`. The MCP schemas, bundled CLI method gate, documentation mapping test, and per-method control metadata all consume this registry. Each entry records scope, required tab context, whether it produces browser input, whether it reads sensitive metadata, and its timeout category. A method absent from the registry fails closed in the Skill CLI.

## Sensitive browser metadata

| Method | Purpose |
|---|---|
| `browser.historySearch` | Chrome history search; requires optional Chrome `history` permission plus Host sensitive-metadata approval |
| `browser.bookmarkSearch` | Bookmark search; requires optional Chrome `bookmarks` permission plus Host sensitive-metadata approval |
| `browser.downloadsSearch` | Download metadata search |

All three methods fail with `SENSITIVE_METADATA_APPROVAL_REQUIRED` until the Host gate is explicitly enabled. History and bookmark searches can additionally fail with `OPTIONAL_PERMISSION_REQUIRED` until the user grants the matching optional browser permission from the extension settings.

## Common error codes

| Code | Meaning |
|---|---|
| `AUTH_FAILED` | Runtime descriptor token was missing or invalid |
| `BRIDGE_NOT_FOUND` | No live Native Host descriptor was discovered |
| `EXTENSION_NOT_READY` | Host exists but the extension handshake is incomplete |
| `SITE_APPROVAL_REQUIRED` | The page host has not been allowed |
| `SITE_BLOCKED` | The extension-side blocklist rejected the host |
| `CDP_METHOD_BLOCKED` | Raw CDP method is not on the allowlist |
| `SENSITIVE_METADATA_APPROVAL_REQUIRED` | Sensitive metadata switch is off |
| `SESSION_CLIPBOARD_READ_APPROVAL_REQUIRED` / `SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED` | The corresponding independent session clipboard gate is off |
| `CLIPBOARD_MIME_NOT_ALLOWED` / `CLIPBOARD_ENCODING_INVALID` / `CLIPBOARD_BINARY_INVALID` | Clipboard type or encoding validation failed |
| `CLIPBOARD_TOO_LARGE` / `CLIPBOARD_ITEMS_INVALID` / `CLIPBOARD_ITEM_INVALID` | Clipboard count, shape, uniqueness, or byte limit failed |
| `VIEWPORT_DIMENSION_INVALID` / `VIEWPORT_SCALE_INVALID` / `VIEWPORT_MOBILE_INVALID` | Responsive viewport parameters are outside the supported safe subset |
| `ACTION_INTENT_REQUIRED` / `ACTION_CONFIRMATION_REQUIRED` | A consequential action must be declared or is awaiting explicit confirmation |
| `ACTION_INTENT_NOT_FOUND` / `ACTION_INTENT_EXPIRED` / `ACTION_INTENT_STATE_INVALID` | The action intent is unavailable, expired, consumed, rejected, or otherwise not executable |
| `OBSERVATION_REQUIRED` / `OBSERVATION_NOT_FOUND` / `OBSERVATION_EXPIRED` | Coordinate input lacks a current screenshot observation |
| `OBSERVATION_DOCUMENT_CHANGED` / `OBSERVATION_VIEWPORT_CHANGED` / `OBSERVATION_VISUAL_CHANGED` | The page no longer matches the screenshot evidence |
| `LOCATOR_NOT_FOUND` | Locator matched no visible element |
| `LOCATOR_AMBIGUOUS` | Locator matched more than one visible element |
| `INPUT_TARGET_OBSCURED` | A pointer target did not become geometrically stable and receive pointer events within the bounded actionability wait |
| `INVALID_LOCATOR` | Locator is empty, contains an unsupported field, or has invalid CSS |
| `LOCATOR_RESULT_TOO_LARGE` | A locator query exceeded its configured collection or text limit |
| `INVALID_FRAME_PATH` | A frame path is malformed or exceeds the nesting limit |
| `FRAME_NOT_FOUND` / `FRAME_AMBIGUOUS` | A frame locator matched zero or multiple visible frame elements |
| `FRAME_INACCESSIBLE` / `FRAME_CONTEXT_CHANGED` | Chrome could not access the frame or its document changed before completion |
| `LOCATOR_WAIT_TIMEOUT` / `URL_WAIT_TIMEOUT` / `LOAD_STATE_TIMEOUT` / `NAVIGATION_TIMEOUT` | A bounded wait did not reach its requested state |
| `TAB_NOT_CLAIMED` / `TAB_OWNED_BY_ANOTHER_SESSION` | The current session lacks the required exclusive tab lease |
| `CONTROL_TYPE_MISMATCH` / `CONTROL_NOT_INTERACTABLE` / `CONTROL_STATE_MISMATCH` | A high-level form operation failed its type, state, or final-value check |
| `DOWNLOAD_TIMEOUT` / `DOWNLOAD_FAILED` | The newly registered download did not complete successfully |
| `FILE_CHOOSER_TIMEOUT` / `FILE_CHOOSER_NOT_FOUND` | A chooser was not captured or is stale |
| `UPLOAD_FILE_INVALID` / `UPLOAD_FILE_NOT_FOUND` | An upload path is not absolute, missing, or not a regular file |
| `BROWSER_TIMEOUT` | Extension operation exceeded its timeout |
| `FOREIGN_FRAME_MONITOR_FAILED` | The monitor could not cover all active page documents or neutralize foreign extension frames |
| `DEBUGGER_INITIALIZATION_CANCELLED` | A detach or tab lifecycle event invalidated initialization; reread state before retrying |

`browser.getInfo` includes compatibility markers for the monitor, debugger lifecycle, and virtual cursor. The latest source reports `foreignFrameMonitor: "remove-after-blank-v11"`, `debuggerState: "generation-v4"`, `virtualCursor: "overlay-v13"`, and `pointerInput: "bounded-pointer-v3"`. Pointer moves use a distance-aware 180–360 ms transition followed by a short arrival pause, and the last tab-local pointer position is restored after navigation. The first render places the pointer synchronously at the viewport center before enabling transitions. A newly injected cursor removes stale overlay hosts and observers left by earlier extension versions. The overlay uses a manual popover to enter the browser top layer, repeats its critical fixed-position and maximum-z-index declarations inside the Shadow DOM, and retries injection at control start, DOM readiness, top-level navigation completion, and activation of a controlled tab. Standard `browser.activateTab` waits for this bounded activation recovery; manual activation schedules the same recovery. Pointer operations are serialized per tab. Control-start cursor recovery runs only when debugger control is first established; generic internal debugger commands do not repeat it. Each movement or action waits for two animation frames when Chrome supplies them, with a 200 ms DOM-state fallback when animation frames are throttled in background, occluded, or unfocused tabs. It then verifies that the overlay is visible in the top layer and belongs to the same top-level document before dispatching browser input; the outer movement and pressed-state holds remain in force. Cursor recovery and required visual feedback each have a single 2.5-second total budget; required feedback retries only transient non-rendering within that budget. Every low-level pointer acknowledgement is independently bounded to 2.5 seconds, and generic internal debugger commands are bounded to 10 seconds. When a click provably creates a new active tab in the same window, unavailable final feedback on the now-background source tab is reported without misclassifying the already-dispatched input; the child tab is returned to the Host for ownership and cleanup. A rendering failure before input, unexpected document replacement, coordinate mismatch, pointer timeout, or internal debugger timeout fails closed with `CURSOR_RENDER_FAILED`, `CURSOR_DOCUMENT_CHANGED`, `CURSOR_POSITION_MISMATCH`, `POINTER_INPUT_TIMEOUT`, or `CDP_COMMAND_TIMEOUT`. Its capabilities include `virtualCursor`. `browser.claimTab` errors include a stage prefix (`foreign-frame-monitor`, `debugger.attach`, `Page.enable`, `Runtime.enable`, or `claim`). Debugger initialization failures may include bounded monitor counts for diagnosis; they do not include foreign extension URLs or contents.

Bridge Client calls default to 30 seconds. Per-call overrides remain available for explicitly long waits; the connection helper and direct client constructor share the same default constant so ordinary browser actions are not accidentally limited to the descriptor-probe timeout.
