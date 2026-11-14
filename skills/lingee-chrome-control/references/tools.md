# Tool reference

Use the public MCP tools when available. The preferred MCP server is `universalChrome`. Use the bundled Node CLI when the client cannot call MCP tools; both are standard high-level surfaces and delegate to the same public bridge methods. Stay on one of these surfaces for the entire task. Raw CDP tools and CDP allowlist mutation are intentionally absent. Never replace a standard operation with `Runtime.evaluate`, `Runtime.callFunctionOn`, DOM `.click()`, injected or page JavaScript, synthetic events, DevTools, or another browser-control tool.

`<skill-root>` below means the resolved absolute directory containing the loaded `SKILL.md`. Replace the placeholder before running a command. The CLI and its public Bridge Client runtime are bundled in the Skill, so an installed package does not need the Bridge source repository. Repository developers may explicitly set `UNIVERSAL_CHROME_BRIDGE_ROOT` to test against a verified checkout; ordinary installations should leave it unset.

## Contents

- [Invocation forms](#invocation-forms)
- [Bundled support scripts](#bundled-support-scripts)
- [Tool mapping](#tool-mapping)
- [Complete example](#complete-example)
- [Locator and coordinate rules](#locator-and-coordinate-rules)

## Invocation forms

- Direct MCP: call the named MCP tool with its JSON arguments, for example `browser_click({"tabId": 7, "locator": {"role": "link", "name": "More information"}})`.
- Node CLI: run `node "<skill-root>/scripts/invoke.mjs" call <bridge.method> '<json>'`, for example `node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":7,"locator":{"role":"link","name":"More information"}}'`.
- Instance discovery is the CLI exception: run `node "<skill-root>/scripts/invoke.mjs" instances`. Select a particular live instance for either surface by setting `UNIVERSAL_BROWSER_INSTANCE_ID` for that client process.

Do not reimplement JSON-RPC, read runtime descriptors, or supply authentication tokens. The public Bridge Client handles discovery and authentication.

## Bundled support scripts

- `node "<skill-root>/scripts/doctor.mjs"`: read-only transport diagnosis with sanitized output.
- `node "<skill-root>/scripts/preflight.mjs"`: read-only version, compatibility, capability, handshake, and policy-gate verification.
- `node "<skill-root>/scripts/install-host.mjs" --extension-id <id> --dry-run`: verify the bundled Windows Host hash and target paths without mutation; omit `--dry-run` only with explicit installation approval.
- `node "<skill-root>/scripts/uninstall-host.mjs"`: remove the per-user Windows Host registration and runtime only with explicit removal approval; policy is preserved.
- `node "<skill-root>/scripts/run-workflow.mjs" validate <workflow.json>`: validate a named high-level workflow without connecting to Chrome.
- `node "<skill-root>/scripts/run-workflow.mjs" run <workflow.json> --workflow <id> --tab-id <id>`: run a reviewed sequence containing only standard methods, using one stable session for the process.
- `references/capabilities.md`: grouped capability and lifecycle overview.
- `references/examples.md`: complete standard CLI workflows for all capability families.
- `references/kdesign.md`: detailed KDesign and KDesign Pro locator, action, verification, and recovery patterns.

## Tool mapping

| Direct MCP tool | Bridge method / CLI target | Required parameters | Optional parameters | Result summary | Use and approval boundary |
|---|---|---|---|---|---|
| `bridge_list_instances` | `instances` | — | — | Array of public instance descriptors: instance ID, PID, transport, host name, and start time. | Discover first; the result never includes endpoint, token, or unknown descriptor fields. |
| `bridge_status` | `bridge.getInfo` | — | — | Bridge identity, selected instance, transport, and extension handshake state. | Call only after instance selection. |
| `policy_get` | `policy.get` | — | — | Effective allowlist, blocklist, global gates, and CDP allowlist. | Read before requesting a policy change. |
| `policy_allow_host` | `policy.allowHost` | `host` | — | Saved effective policy. | Allow the exact HTTP(S) host and subdomains only after explicit user approval. |
| `policy_block_host` | `policy.blockHost` | `host` | — | Saved effective policy. | Block the host and its subdomains; the blocklist wins. |
| `policy_set_allow_all` | `policy.setAllowAll` | `enabled` | — | Saved effective policy. | Global site access requires explicit user approval; keep disabled by default. |
| `policy_set_sensitive_metadata` | `policy.setSensitiveMetadata` | `enabled` | — | Saved effective policy. | History, bookmark, and download metadata access requires explicit user approval. |
| `browser_get_info` | `browser.getInfo` | — | — | Browser backend identity, version, and capability list. | Read-only capability discovery. |
| `browser_list_tabs` | `browser.listTabs` | — | `query` | Array of Chrome tab records. | Unapproved-site details are redacted. |
| `browser_get_tab` | `browser.getTab` | `tabId` | — | One Chrome tab record. | Unapproved-site details are redacted. |
| `browser_open_tab` | `browser.openTab` | `url` | `active`, `windowId` | Created Chrome tab record. | The target URL must be approved. |
| `browser_close_tab` | `browser.closeTab` | `tabId` | — | Closure confirmation. | Confirm first if unsaved work may be lost. |
| `browser_activate_tab` | `browser.activateTab` | `tabId` | — | Activated tab record. | Also focuses its Chrome window. |
| `browser_claim_tab` | `browser.claimTab` | `tabId` | — | Claimed tab record. | Installs the controlled-tab foreign-frame monitor, then attaches debugger-backed control to an approved tab. |
| `browser_get_lease` | `browser.getLease` | `tabId` | — | Lease timing, temporary/marker state, and whether the current session owns it. | Does not reveal another session's identifier. |
| `browser_transfer_tab` | `browser.transferTab` | `tabId`, `targetSessionId` | — | Transferred lease state. | Only the current owner can transfer the tab. |
| `browser_end_session` | `browser.endSession` | — | — | Closed temporary tab IDs and preserved tab reasons. | Marked, user-owned, unsaved, or failed-cleanup tabs are preserved. |
| `browser_detach_tab` | `browser.detachTab` | `tabId` | — | Detach confirmation. | Releases debugger-backed control. |
| `browser_mark_handoff` | `browser.markHandoff` | `tabId` | — | Marked lease state. | Prevents automatic temporary-tab cleanup. |
| `browser_mark_deliverable` | `browser.markDeliverable` | `tabId` | — | Marked lease state. | Prevents automatic temporary-tab cleanup. |
| `browser_navigate` | `browser.navigate` | `tabId`, `url` | — | Updated tab record. | The target URL must be approved. |
| `browser_back` | `browser.back` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_forward` | `browser.forward` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_reload` | `browser.reload` | `tabId` | `bypassCache` | Reload acknowledgement. | Verify whether prior mutations already occurred. |
| `browser_group_tabs` | `browser.groupTabs` | `tabIds` | `groupId`, `title`, `color`, `collapsed` | Chrome tab-group record. | Group only the intended tabs. |
| `browser_read_text` | `browser.readText` | `tabId` | `maxChars` | URL, title, and bounded visible body text. | Prefer this for lightweight observation. |
| `browser_dom_snapshot` | `browser.domSnapshot` | `tabId` | `maxNodes`, `maxTextChars` | Compact interactive DOM nodes and page metadata. | Use to construct stable locators. |
| `browser_locator_count` | `browser.locatorCount` | `tabId`, `locator` | `framePath` | Number of elements matching the locator, including hidden elements. | Read-only; supports an optional ordered frame path. |
| `browser_locator_all_text_contents` | `browser.locatorAllTextContents` | `tabId`, `locator` | `framePath`, `maxResults`, `maxCharsPerItem`, `maxTotalChars` | Bounded array of textContent strings for all matches. | Read-only; supports an optional ordered frame path and fails closed at size limits. |
| `browser_locator_inner_text` | `browser.locatorInnerText` | `tabId`, `locator` | `framePath`, `maxChars` | Bounded innerText string from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_text_content` | `browser.locatorTextContent` | `tabId`, `locator` | `framePath`, `maxChars` | Bounded textContent string or null from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_get_attribute` | `browser.locatorGetAttribute` | `tabId`, `locator`, `name` | `framePath`, `maxChars` | Bounded attribute string or null from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_is_visible` | `browser.locatorIsVisible` | `tabId`, `locator` | `framePath` | Boolean visibility result; false when no element matches. | Read-only; supports an optional ordered frame path. |
| `browser_locator_is_enabled` | `browser.locatorIsEnabled` | `tabId`, `locator` | `framePath` | Boolean enabled result; false when no element matches. | Read-only; supports an optional ordered frame path. |
| `browser_wait_for` | `browser.waitFor` | `tabId`, `locator`, `state` | `framePath`, `timeoutMs` | Final element state, counts, and elapsed time. | Bounded, navigation-aware and does not dispatch input. |
| `browser_wait_for_url` | `browser.waitForURL` | `tabId`, `url` | `match`, `waitUntil`, `timeoutMs` | Matched URL and elapsed time. | Supports exact, contains, and glob matching with an optional load-state gate. |
| `browser_wait_for_load_state` | `browser.waitForLoadState` | `tabId`, `state` | `timeoutMs` | Reached load state, URL, document identity, and elapsed time. | networkidle is bounded and requires 500ms with no tracked requests. |
| `browser_expect_navigation` | `browser.expectNavigation` | `tabId`, `action` | `url`, `match`, `waitUntil`, `timeoutMs` | Action result plus the observed navigation and load state. | Registers the navigation expectation before the reviewed high-level action. |
| `browser_accessibility_snapshot` | `browser.accessibilitySnapshot` | `tabId` | — | Chrome accessibility tree. | Use for accessible roles, names, and state. |
| `browser_screenshot` | `browser.screenshot` | `tabId` | `format`, `quality`, `captureBeyondViewport` | MCP image content with MIME type. | Capture sensitive visual data only when needed. |
| `browser_click` | `browser.click` | `tabId`, `locator` | `framePath`, `button`, `clickCount` | Click result for the uniquely resolved element. | Supports an optional ordered frame path; use a stable visible locator. |
| `browser_fill` | `browser.fill` | `tabId`, `locator`, `value` | `framePath` | Fill result for the uniquely resolved input. | Supports an optional ordered frame path; never supply secrets. |
| `browser_check` | `browser.check` | `tabId`, `locator` | `framePath` | Verified checked state and whether it changed. | Uses a synchronized visible click and verifies the final state. |
| `browser_uncheck` | `browser.uncheck` | `tabId`, `locator` | `framePath` | Verified unchecked state and whether it changed. | Radio inputs cannot be unchecked directly. |
| `browser_set_checked` | `browser.setChecked` | `tabId`, `locator`, `checked` | `framePath` | Verified checked state and whether it changed. | Dispatches input only when the current state differs. |
| `browser_select_option` | `browser.selectOption` | `tabId`, `locator`, `options` | `framePath` | Verified selected values, labels, and multiple flag. | Requires a visible enabled native select and validates every requested option. |
| `browser_double_click` | `browser.doubleClick` | `tabId`, `locator` | `framePath`, `button` | Double-click result for the uniquely resolved element. | Uses the same strong visual/input binding as browser.click. |
| `browser_press_sequentially` | `browser.pressSequentially` | `tabId`, `locator`, `text` | `framePath`, `delayMs`, `timeoutMs` | Typed length, final value length, and elapsed time. | Focuses visibly, dispatches characters sequentially, and verifies the final value. |
| `browser_wait_for_download` | `browser.waitForDownload` | `tabId`, `action` | `timeoutMs` | Action result and completed download identity, filename, path, state, sizes, and source URL. | The expectation is registered before the action; downloaded files are never executed automatically. |
| `browser_download_media` | `browser.downloadMedia` | `tabId`, `locator` | `framePath`, `timeoutMs` | Action result and completed download record. | Only a locator-backed downloadable URL allowed by site policy is accepted. |
| `browser_wait_for_file_chooser` | `browser.waitForFileChooser` | `tabId`, `action` | `timeoutMs` | Action result, chooser ID, and multiple-file flag. | Register before triggering a dynamic or hidden file chooser. |
| `browser_set_file_chooser_files` | `browser.setFileChooserFiles` | `tabId`, `chooserId`, `files` | — | Chooser assignment and file basenames. | Host validates existence and multiplicity without reading file contents. |
| `browser_press` | `browser.press` | `tabId`, `key` | `modifiers`, `locator`, `framePath` | Key-dispatch acknowledgement. | framePath requires locator; the locator is visibly focused first. |
| `browser_type` | `browser.type` | `tabId`, `text` | `locator`, `framePath` | Typed flag and inserted-text length. | framePath requires locator; insert only non-secret text. |
| `browser_mouse_move` | `browser.mouseMove` | `tabId`, `x`, `y` | — | Final viewport coordinates. | Use only with current viewport evidence. The extension paints and verifies movement before dispatching input. |
| `browser_coordinate_click` | `browser.coordinateClick` | `tabId`, `x`, `y` | `button`, `clickCount` | Clicked coordinates, button, and count. | Use only after semantic retries and a fresh screenshot. Visual pressed/click feedback is part of the operation. |
| `browser_drag` | `browser.drag` | `tabId`, `from`, `to` | `steps` | Drag result with resolved endpoints. | Use current points or unique locators. Each visual drag step precedes its input event. |
| `browser_wheel` | `browser.wheel` | `tabId`, `x`, `y` | `deltaX`, `deltaY` | Wheel-dispatch acknowledgement. | Coordinates refer to the current viewport. Wheel feedback must paint before dispatch. |
| `browser_scroll` | `browser.scroll` | `tabId` | `deltaX`, `deltaY` | Resulting page scroll coordinates. | Re-read state after scrolling. Scroll feedback must paint before the page moves. |
| `browser_set_file_input` | `browser.setFileInput` | `tabId`, `selector`, `files` | `framePath` | File-input assignment result. | Supports an optional ordered frame path; verify exact file scope first. |
| `browser_get_dialog` | `browser.getDialog` | `tabId` | — | Active dialog identity, type, message, URL, and prompt default, or null. | Read after an action reports dialogOpened; use its ID when handling the dialog. |
| `browser_handle_dialog` | `browser.handleDialog` | `tabId` | `dialogId`, `accept`, `promptText` | Handled dialog identity and acknowledgement after the close event. | Confirm consequential accept or dismiss choices. Pass dialogId to reject stale dialog decisions. |
| `browser_get_events` | `browser.getEvents` | `tabId` | `afterSequence`, `limit`, `methods` | Buffered events with cursor, pagination, and truncation state. | Continue from the returned sequence cursor. |
| `browser_get_console_logs` | `browser.getConsoleLogs` | `tabId` | `afterSequence`, `limit`, `levels`, `text` | Structured log entries, cursor, pagination, and truncation state. | Object handles are never returned; source URLs are policy-checked and stripped of query/hash. |
| `browser_history_search` | `browser.historySearch` | — | `text`, `startTime`, `endTime`, `maxResults` | Array of Chrome history records. | Sensitive history metadata requires explicit user approval. |
| `browser_bookmark_search` | `browser.bookmarkSearch` | — | `query`, `text` | Array of Chrome bookmark records. | Sensitive bookmark metadata requires explicit user approval. |
| `browser_downloads_search` | `browser.downloadsSearch` | — | `query` | Array of Chrome download metadata records. | Sensitive download metadata requires explicit user approval. |

## Complete example

After the user explicitly approves `example.com`, allow it, open it, read the DOM, click the link by role/name, and verify the visible result.

Direct MCP sequence:

```text
bridge_list_instances({})
bridge_status({})
policy_get({})
policy_allow_host({"host":"example.com"})
browser_open_tab({"url":"https://example.com"}) -> {"id":7,...}
browser_dom_snapshot({"tabId":7})
browser_click({"tabId":7,"locator":{"role":"link","name":"More information"}})
browser_read_text({"tabId":7})
```

Confirm that the final URL/title/text differs as expected; do not infer success from the click response alone.

Equivalent Node CLI sequence:

```powershell
node "<skill-root>/scripts/invoke.mjs" instances
node "<skill-root>/scripts/invoke.mjs" call bridge.getInfo '{}'
node "<skill-root>/scripts/invoke.mjs" call policy.get '{}'
node "<skill-root>/scripts/invoke.mjs" call policy.allowHost '{"host":"example.com"}'
node "<skill-root>/scripts/invoke.mjs" call browser.openTab '{"url":"https://example.com"}'
node "<skill-root>/scripts/invoke.mjs" call browser.domSnapshot '{"tabId":7}'
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":7,"locator":{"role":"link","name":"More information"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.readText '{"tabId":7}'
```

Use the actual `tabId` returned by `browser.openTab`; `7` only shows how values flow between calls.

## Locator and coordinate rules

Construct locators in this order: stable `testId`; role plus accessible name; label; exact visible text; stable CSS. A locator must resolve to exactly one visible element. On `LOCATOR_NOT_FOUND` or `LOCATOR_AMBIGUOUS`, re-read DOM/accessibility state and refine the semantic locator. Only after repeated semantic inspection fails may a fresh screenshot support a coordinate action. Read state immediately afterward.
