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
| `policy.allowCdpMethod` | `command` | Add one raw CDP method to the allowlist |

The blocklist always takes precedence over the allowlist and `allowAll`.

## Browser lifecycle and tabs

| Method | Required parameters |
|---|---|
| `browser.getInfo` | — |
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
| `browser.check` / `browser.uncheck` / `browser.setChecked` | `tabId`, `locator` | Set and verify native checkbox/radio state with visible input |
| `browser.selectOption` | `tabId`, `locator`, `options` | Select native options by value, label, or index and verify values |
| `browser.doubleClick` / `browser.pressSequentially` | `tabId`, `locator` | Strongly bound double click or bounded character-by-character input |
| `browser.waitForDownload` / `browser.downloadMedia` | `tabId`, action or locator | Action-bound completed download with reviewed source URL |
| `browser.waitForFileChooser` / `browser.setFileChooserFiles` | `tabId`, action or chooser ID | Capture a chooser before its action and set validated files |
| `browser.getConsoleLogs` | `tabId` | Filtered bounded structured console entries with sequence cursor |
| `browser.accessibilitySnapshot` | `tabId` | Chrome accessibility tree |
| `browser.screenshot` | `tabId` | Base64 image and MIME type |

## Page interaction

| Method | Required parameters |
|---|---|
| `browser.click` | `tabId`, `locator` |
| `browser.fill` | `tabId`, `locator`, `value` |
| `browser.press` | `tabId`, `key` |
| `browser.type` | `tabId`, `text` |
| `browser.mouseMove` | `tabId`, `x`, `y` |
| `browser.coordinateClick` | `tabId`, `x`, `y` |
| `browser.drag` | `tabId`, `from`, `to` |
| `browser.wheel` | `tabId`, `x`, `y` |
| `browser.scroll` | `tabId` and optional deltas |
| `browser.setFileInput` | `tabId`, `selector`, `files` |
| `browser.getDialog` | `tabId` |
| `browser.handleDialog` | `tabId` and optional `dialogId`, `accept`, `promptText` |

A locator supports `css`, `role` plus `name`, `label`, `text`, or `testId`. Locator queries and click/fill/press/type/drag/file input accept an optional ordered `framePath`, whose entries use the same locator shape to enter nested frames. Each frame document and loader is revalidated before input; removed or navigated frames invalidate old context. Cross-origin frame URLs are independently checked by the Native Host site policy. Input operations require one visible match. Strict read operations reject zero matches and ambiguous matches; `locatorCount` and `locatorAllTextContents` intentionally operate on collections, while the state predicates return false for zero matches. Query operations never scroll, focus, or dispatch input. Collection length and returned text are bounded.

JavaScript dialogs follow the same lifecycle as Codex Browser Use: the extension subscribes before the triggering pointer release, records the dialog as a first-class object, and lets the click return with `dialogOpened` even if Chrome still has the input command pending. Call `browser.getDialog`, then pass its `id` to `browser.handleDialog`. Dialog handling goes directly to the already attached debugger target and waits for `Page.javascriptDialogClosed`; it does not run page scripts or cursor recovery while the modal dialog is open.

Each Bridge client sends a non-secret session ID outside browser method parameters. `browser.claimTab` establishes an exclusive renewable lease; read-only methods remain shareable, while navigation, input, close and detach require ownership. `browser.getLease` never reveals another session ID. `browser.transferTab`, `browser.markHandoff`, `browser.markDeliverable`, and `browser.endSession` implement explicit transfer and cleanup. Tabs opened by the session or by its controlled actions are temporary; marked, user-owned, unsaved, and failed-cleanup tabs are preserved.

Claiming a tab renders the persistent Precision Glass overlay in its top frame before the first controlled action: a centered `Lingee 正在控制` chip, a short viewport-edge sweep, and a dual-outline pointer centered in the viewport. Clicks add two rings and a center flash, wheel and scroll calls show a directional capsule beside the pointer, and drag shows an origin dot and tether. Navigation rebuilds and recenters the overlay. It has no hit testing, restores itself if its host is removed, and remains visible until `browser.detachTab`. Restricted browser pages may accept CDP input while rejecting overlay injection; in that case the action still runs without the visual pointer.

## Debugging and events

| Method | Required parameters |
|---|---|
| `browser.cdp` | `tabId`, `command` |
| `browser.getEvents` | optional cursor, tab and method filters |

Only CDP methods in `policy.allowedCdpMethods` are accepted. Event results contain `cursor`, `hasMore`, and `truncated` fields.

The `lingee-chrome-control` Skill exposes a standard high-level MCP/CLI surface. Its MCP server does not publish `policy_allow_cdp_method` or `browser_cdp`, and its bundled CLI rejects `policy.allowCdpMethod`, `browser.cdp`, unknown methods, and direct CDP method names with `NONSTANDARD_BROWSER_CONTROL_BLOCKED` before connecting to Chrome. The raw Bridge methods remain documented here for non-Skill development and are outside the Skill control contract.

The standard surface has one authoritative registry at `skills/lingee-chrome-control/scripts/runtime/standard-capabilities.mjs`. The MCP schemas, bundled CLI method gate, documentation mapping test, and per-method control metadata all consume this registry. Each entry records scope, required tab context, whether it produces browser input, whether it reads sensitive metadata, and its timeout category. A method absent from the registry fails closed in the Skill CLI.

## Sensitive browser metadata

| Method | Purpose |
|---|---|
| `browser.historySearch` | Chrome history search |
| `browser.bookmarkSearch` | Bookmark search |
| `browser.downloadsSearch` | Download metadata search |

These methods fail with `SENSITIVE_METADATA_APPROVAL_REQUIRED` until explicitly enabled.

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
| `LOCATOR_NOT_FOUND` | Locator matched no visible element |
| `LOCATOR_AMBIGUOUS` | Locator matched more than one visible element |
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

`browser.getInfo` includes compatibility markers for the monitor, debugger lifecycle, and virtual cursor. The latest source reports `foreignFrameMonitor: "remove-after-blank-v11"`, `debuggerState: "generation-v4"`, and `virtualCursor: "overlay-v13"`. Pointer moves use a distance-aware 180–360 ms transition followed by a short arrival pause, and the last tab-local pointer position is restored after navigation. The first render places the pointer synchronously at the viewport center before enabling transitions. A newly injected cursor removes stale overlay hosts and observers left by earlier extension versions. The overlay uses a manual popover to enter the browser top layer, repeats its critical fixed-position and maximum-z-index declarations inside the Shadow DOM, and retries injection at control start, DOM readiness, and top-level navigation completion. Pointer operations are serialized per tab. Each movement or action waits for its visual state to paint, verifies that the overlay is still visible in the top layer and belongs to the same top-level document, then dispatches the corresponding browser input. A rendering failure, unexpected document replacement, or coordinate mismatch fails closed with `CURSOR_RENDER_FAILED`, `CURSOR_DOCUMENT_CHANGED`, or `CURSOR_POSITION_MISMATCH`; no corresponding browser input is sent. Its capabilities include `virtualCursor`. `browser.claimTab` errors include a stage prefix (`foreign-frame-monitor`, `debugger.attach`, `Page.enable`, `Runtime.enable`, or `claim`). Debugger initialization failures may include bounded monitor counts for diagnosis; they do not include foreign extension URLs or contents.
