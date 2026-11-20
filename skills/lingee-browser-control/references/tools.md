# Tool reference

Use the public MCP tools when available. The preferred MCP server is `lingeeBrowser`. Use the bundled Node CLI when the client cannot call MCP tools; both are standard high-level surfaces and delegate to the same public bridge methods. Stay on one of these surfaces for the entire task. Raw CDP tools and CDP allowlist mutation are intentionally absent. Never replace a standard operation with `Runtime.evaluate`, `Runtime.callFunctionOn`, DOM `.click()`, injected or page JavaScript, synthetic events, DevTools, or another browser-control tool.

`<skill-root>` below means the resolved absolute directory containing the loaded `SKILL.md`. Replace the placeholder before running a command. The CLI and its public Bridge Client runtime are bundled in the Skill, so an installed package does not need the Bridge source repository. Repository developers may explicitly set `LINGEE_BROWSER_BRIDGE_ROOT` to test against a verified checkout; ordinary installations should leave it unset. The removed `UNIVERSAL_CHROME_BRIDGE_ROOT` name is not accepted in 0.2.x.

## Contents

- [Invocation forms](#invocation-forms)
- [Bundled support scripts](#bundled-support-scripts)
- [Tool mapping](#tool-mapping)
- [Complete example](#complete-example)
- [Locator and coordinate rules](#locator-and-coordinate-rules)

## Invocation forms

- Direct MCP: call the named MCP tool with its JSON arguments, for example `browser_click({"tabId": 7, "locator": {"role": "link", "name": "More information"}})`.
- Node CLI on Windows: never pass JSON as a positional argument. Pipe a PowerShell object through `ConvertTo-Json -Depth 20 -Compress` to `node "<skill-root>/scripts/invoke.mjs" call <bridge.method> --params-stdin`, or use `--params-file <path>` for a reviewed UTF-8 JSON file. Parameterless methods take no JSON argument. Windows inline JSON fails closed with `POWERSHELL_INLINE_JSON_UNSUPPORTED` and a copyable correction.
- Instance discovery is the CLI exception: run `node "<skill-root>/scripts/invoke.mjs" instances`. Select a particular live instance for either surface by setting `LINGEE_BROWSER_INSTANCE_ID` for that client process.
- Local CLI discovery requires no Bridge connection: use `info` to verify the loaded Skill name/version/root, `methods` to list allowed Bridge methods, and `describe <method>` to inspect one schema. Unsupported calls include bounded closest-method suggestions.
- For screenshots, add `--save-screenshot <absolute-path>` to `call browser.screenshot ...`; the CLI writes the image and returns only metadata/path/byte count, so Base64 never enters console or chat logs.

Do not reimplement JSON-RPC, read runtime descriptors, or supply authentication tokens. The public Bridge Client handles discovery and authentication.

`jsonParams`, `--params-stdin`, and `--params-file` are mutually exclusive. Both external input forms are limited to 1 MiB, accept an optional UTF-8 BOM, and are parsed before instance discovery or browser connection. Invalid input returns `INVALID_ARGUMENTS`; an unreadable file returns `PARAMS_INPUT_ERROR`.

## Bundled support scripts

- `node "<skill-root>/scripts/doctor.mjs"`: read-only transport diagnosis with sanitized output.
- `node "<skill-root>/scripts/preflight.mjs"`: read-only version, compatibility, capability, handshake, and policy-gate verification.
- `node "<skill-root>/scripts/install-host.mjs" --extension-id <id> --dry-run`: verify Node.js 22+, the exact system Node path, bundled launcher/Host-script hashes, extension ID, and target paths without mutation; omit `--dry-run` only with explicit installation approval. See `references/host-installation.md`.
- `node "<skill-root>/scripts/uninstall-host.mjs"`: remove the per-user Windows Host registration and runtime only with explicit removal approval; policy is preserved.
- `node "<skill-root>/scripts/run-workflow.mjs" validate <workflow.json>`: validate a named high-level workflow without connecting to the browser.
- `node "<skill-root>/scripts/run-workflow.mjs" run <workflow.json> --workflow <id> --tab-id <id>`: run a reviewed sequence containing only standard methods, using one stable session for the process. For typed variables on PowerShell 5.1, pipe one uppercase-key JSON object through `--vars-stdin` or use `--vars-file <path>`; reserve `--var NAME=JSON` for simple scalar values.
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
| `policy_set_session_clipboard_read` | `policy.setSessionClipboardRead` | `enabled` | — | Saved effective policy. | Requires explicit approval independent of clipboard write access; never reads the operating-system clipboard. |
| `policy_set_session_clipboard_write` | `policy.setSessionClipboardWrite` | `enabled` | — | Saved effective policy. | Requires explicit approval independent of clipboard read access; never writes the operating-system clipboard. |
| `browser_get_info` | `browser.getInfo` | — | — | Browser backend identity, version, and capability list. | Read-only capability discovery. |
| `browser_list_tabs` | `browser.listTabs` | — | `query` | Array of browser tab records. | Unapproved-site details are redacted. |
| `browser_get_tab` | `browser.getTab` | `tabId` | — | One browser tab record. | Unapproved-site details are redacted. |
| `browser_open_tab` | `browser.openTab` | `url` | `active`, `windowId` | Created browser tab record. | The target URL must be approved. |
| `browser_close_tab` | `browser.closeTab` | `tabId` | — | Closure confirmation. | Confirm first if unsaved work may be lost. |
| `browser_activate_tab` | `browser.activateTab` | `tabId` | — | Activated tab record. | Also focuses its browser window. |
| `browser_claim_tab` | `browser.claimTab` | `tabId` | — | Claimed tab record. | Installs the controlled-tab foreign-frame monitor, then attaches debugger-backed control to an approved tab. |
| `browser_get_lease` | `browser.getLease` | `tabId` | — | Lease timing, temporary/marker state, and whether the current session owns it. | Does not reveal another session's identifier. |
| `browser_transfer_tab` | `browser.transferTab` | `tabId`, `targetSessionId` | — | Transferred lease state. | Only the current owner can transfer the tab. |
| `browser_end_session` | `browser.endSession` | — | — | Closed/preserved tabs, clipboard, action-intent and resource-export cleanup, and viewport reset results. | Marked, user-owned, unsaved, or failed-cleanup tabs are preserved; session-temporary intents and resource archives are removed. |
| `browser_session_clipboard_write` | `browser.sessionClipboardWrite` | `items` | — | Item count, MIME types, byte size, and update time without echoing content. | Requires the independent clipboard-write gate. Supports UTF-8 plain text, Markdown, HTML, and canonical Base64 PNG only; never touches the OS clipboard. |
| `browser_session_clipboard_read` | `browser.sessionClipboardRead` | — | `mimeTypes` | Typed clipboard items with encoding, data, byte size, and update time. | Requires the independent clipboard-read gate. Content is session-isolated, memory-only, bounded, and never sourced from the OS clipboard. |
| `browser_session_clipboard_clear` | `browser.sessionClipboardClear` | — | — | Whether content was cleared plus prior item and byte counts. | Requires the clipboard-write gate. Session end and expiry clear the same memory automatically. |
| `browser_prepare_action_intent` | `browser.prepareActionIntent` | `tabId`, `actionType`, `summary`, `action` | `dataTypes` | Intent ID, risk class, exact origin, top-level document identity, expiry, and confirmation-required state. | Finish reviewed form and switch changes first. A later controlled mutation or document replacement makes the intent stale and requires a new intent and confirmation. |
| `browser_confirm_action_intent` | `browser.confirmActionIntent` | `intentId`, `decision` | `rememberForSession` | Updated intent state without executing it. | Call only after obtaining the required user confirmation. Session remembrance is exact-scope and is erased at session end. |
| `browser_execute_action_intent` | `browser.executeActionIntent` | `intentId` | — | Consumed intent metadata and the exact action result. | Pending intents return ACTION_CONFIRMATION_REQUIRED; changed page/form state returns ACTION_INTENT_STALE. Intents are tab-, origin-, document-, action-, session-, and expiry-bound and single-use. |
| `browser_detach_tab` | `browser.detachTab` | `tabId` | — | Detach confirmation. | Releases debugger-backed control. |
| `browser_mark_handoff` | `browser.markHandoff` | `tabId` | — | Marked lease state. | Prevents automatic temporary-tab cleanup. |
| `browser_mark_deliverable` | `browser.markDeliverable` | `tabId` | — | Marked lease state. | Prevents automatic temporary-tab cleanup. |
| `browser_navigate` | `browser.navigate` | `tabId`, `url` | — | Updated tab record. | The target URL must be approved. |
| `browser_back` | `browser.back` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_forward` | `browser.forward` | `tabId` | — | Navigation acknowledgement. | Verify the resulting state. |
| `browser_reload` | `browser.reload` | `tabId` | `bypassCache` | Reload acknowledgement. | Verify whether prior mutations already occurred. |
| `browser_group_tabs` | `browser.groupTabs` | `tabIds` | `groupId`, `title`, `color`, `collapsed` | Browser tab-group record. | Group only the intended tabs. |
| `browser_read_text` | `browser.readText` | `tabId` | `maxChars` | URL, title, and bounded visible body text. | Prefer this for lightweight observation. |
| `browser_dom_snapshot` | `browser.domSnapshot` | `tabId` | `maxNodes`, `maxTextChars`, `includeGenericClickable`, `includeFormContext` | Compact interactive DOM nodes, bounded form context, stable attributes, and page metadata. | Set includeGenericClickable for KDesign-style pointer div/span controls. Password values are always redacted. |
| `browser_locator_count` | `browser.locatorCount` | `tabId`, `locator` | `framePath` | Number of elements matching the locator, including hidden elements. | Read-only; supports an optional ordered frame path. |
| `browser_locator_all_text_contents` | `browser.locatorAllTextContents` | `tabId`, `locator` | `framePath`, `maxResults`, `maxCharsPerItem`, `maxTotalChars` | Bounded array of textContent strings for all matches. | Read-only; supports an optional ordered frame path and fails closed at size limits. |
| `browser_locator_describe_all` | `browser.locatorDescribeAll` | `tabId`, `locator` | `framePath`, `maxResults`, `maxTextChars` | Bounded element descriptors with selector, role, name, field label, value/state, stable attributes, and rectangle. | Use before choosing among generic KDesign controls. Password values are redacted and oversized result sets fail closed. |
| `browser_locator_state` | `browser.locatorState` | `tabId`, `locator` | `framePath`, `maxTextChars` | One structured descriptor including current form value and checked/selected state. | Use for post-fill and persistence verification; the locator must be unique. |
| `browser_locator_inner_text` | `browser.locatorInnerText` | `tabId`, `locator` | `framePath`, `maxChars` | Bounded innerText string from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_text_content` | `browser.locatorTextContent` | `tabId`, `locator` | `framePath`, `maxChars` | Bounded textContent string or null from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_get_attribute` | `browser.locatorGetAttribute` | `tabId`, `locator`, `name` | `framePath`, `maxChars` | Bounded attribute string or null from one unique match. | Read-only; supports an optional ordered frame path. |
| `browser_locator_is_visible` | `browser.locatorIsVisible` | `tabId`, `locator` | `framePath` | Boolean visibility result; false when no element matches. | Read-only; supports an optional ordered frame path. |
| `browser_locator_is_enabled` | `browser.locatorIsEnabled` | `tabId`, `locator` | `framePath` | Boolean enabled result; false when no element matches. | Read-only; supports an optional ordered frame path. |
| `browser_wait_for` | `browser.waitFor` | `tabId`, `locator`, `state` | `framePath`, `timeoutMs` | Final element state, counts, and elapsed time. | Bounded, navigation-aware and does not dispatch input. |
| `browser_wait_for_url` | `browser.waitForURL` | `tabId`, `url` | `match`, `waitUntil`, `timeoutMs` | Matched URL and elapsed time. | Supports exact, contains, and glob matching with an optional load-state gate. |
| `browser_wait_for_load_state` | `browser.waitForLoadState` | `tabId`, `state` | `timeoutMs` | Reached load state, URL, document identity, and elapsed time. | networkidle is bounded and requires 500ms with no tracked requests. |
| `browser_expect_navigation` | `browser.expectNavigation` | `tabId`, `action` | `url`, `match`, `waitUntil`, `timeoutMs` | Action result plus the observed navigation and load state. | Registers the navigation expectation before the reviewed high-level action. |
| `browser_perform_and_wait_for_feedback` | `browser.performAndWaitForFeedback` | `tabId`, `action`, `text` | `exact`, `timeoutMs`, `maxTextChars` | Action result plus the first matching transient feedback, document identity, count, and elapsed time. | Registers before the visible action, so short-lived Toast, Message, Notification, role=status, and role=alert content can be captured even after it disappears. Feedback is supplementary; verify durable application state separately. |
| `browser_accessibility_snapshot` | `browser.accessibilitySnapshot` | `tabId` | — | Browser accessibility tree. | Use for accessible roles, names, and state. |
| `browser_screenshot` | `browser.screenshot` | `tabId` | `format`, `quality`, `captureBeyondViewport` | Image content plus observation ID, coordinate-safety flag, operation sequence, and expiry metadata. | A viewport PNG observation is required by coordinate input and becomes stale after navigation, layout, viewport, window, scroll, or pointer actions. |
| `browser_get_viewport` | `browser.getViewport` | `tabId` | — | Viewport dimensions, page offset, scale, device scale, mobile flag, and emulation state. | Read-only; use before screenshots or coordinate input. |
| `browser_set_viewport` | `browser.setViewport` | `tabId`, `width`, `height` | `deviceScaleFactor`, `mobile`, `preserveOnSessionEnd` | Requested and observed viewport state after pointer recalibration. | The override resets at session end unless preserveOnSessionEnd is explicitly requested. |
| `browser_reset_viewport` | `browser.resetViewport` | `tabId` | — | Restored viewport state and whether an override changed. | Use after responsive checks; session end also resets temporary overrides. |
| `browser_list_observed_resources` | `browser.listObservedResources` | `tabId` | `types`, `mimeTypes`, `maxResults` | Opaque document-bound resource IDs with approved URLs, types, MIME types, sizes, and suggested filenames. | Only the current top-level document resource tree is listed; unapproved hosts and non-HTTP(S) resources are omitted. |
| `browser_export_observed_resources` | `browser.exportObservedResources` | `tabId`, `resourceIds` | — | Local ZIP path, selected-resource counts, byte sizes, and session-temporary lifecycle. | Accepts only opaque IDs returned by browser_list_observed_resources for the unchanged approved document; it exposes no arbitrary URL fetch or page-script capability. |
| `browser_click` | `browser.click` | `tabId`, `locator` | `framePath`, `button`, `clickCount` | Click result for the uniquely resolved element. | Supports an optional ordered frame path; use a stable visible locator. |
| `browser_fill` | `browser.fill` | `tabId`, `locator`, `value` | `framePath` | Verified final value length for the uniquely resolved input. | Atomically replaces existing controlled-input text and fails closed on a final-value mismatch; supports an optional ordered frame path; never supply secrets. |
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
| `browser_mouse_move` | `browser.mouseMove` | `tabId`, `observationId`, `x`, `y` | — | Final viewport coordinates with the consumed observation and operation sequence. | Requires a fresh coordinate-safe screenshot observation. The extension revalidates document, viewport and normalized DOM/layout evidence before painting and input. |
| `browser_coordinate_click` | `browser.coordinateClick` | `tabId`, `observationId`, `x`, `y` | `button`, `clickCount` | Clicked coordinates, consumed observation ID, operation sequence, button, and count. | Requires a fresh coordinate-safe screenshot after semantic retries. Visual feedback and actual input share one operation sequence. |
| `browser_drag` | `browser.drag` | `tabId`, `observationId`, `from`, `to` | `steps` | Drag result with resolved endpoints, consumed observation ID, and operation sequence. | Requires a fresh coordinate-safe screenshot; each visual drag step precedes its input event. |
| `browser_wheel` | `browser.wheel` | `tabId`, `observationId`, `x`, `y` | `deltaX`, `deltaY` | Wheel acknowledgement with consumed observation ID and operation sequence. | Requires a fresh coordinate-safe screenshot; wheel feedback and actual input share one operation sequence. |
| `browser_scroll` | `browser.scroll` | `tabId`, `observationId` | `deltaX`, `deltaY` | Resulting page scroll coordinates with consumed observation ID and operation sequence. | The observation is invalidated after scrolling; capture a new screenshot before any later coordinate input. |
| `browser_set_file_input` | `browser.setFileInput` | `tabId`, `selector`, `files` | `framePath` | File-input assignment result. | Supports an optional ordered frame path; verify exact file scope first. |
| `browser_get_dialog` | `browser.getDialog` | `tabId` | — | Active dialog identity, type, message, URL, and prompt default, or null. | Read after an action reports dialogOpened; use its ID when handling the dialog. |
| `browser_handle_dialog` | `browser.handleDialog` | `tabId` | `dialogId`, `accept`, `promptText` | Handled dialog identity and acknowledgement after the close event. | Confirm consequential accept or dismiss choices. Pass dialogId to reject stale dialog decisions. |
| `browser_get_events` | `browser.getEvents` | `tabId` | `afterSequence`, `limit`, `methods` | Buffered events with cursor, pagination, and truncation state. | Continue from the returned sequence cursor. |
| `browser_get_console_logs` | `browser.getConsoleLogs` | `tabId` | `afterSequence`, `limit`, `levels`, `text` | Structured log entries, cursor, pagination, and truncation state. | Object handles are never returned; source URLs are policy-checked and stripped of query/hash. |
| `browser_history_search` | `browser.historySearch` | — | `text`, `startTime`, `endTime`, `maxResults` | Array of browser history records. | Requires a user-granted optional Chrome permission and explicit Host approval. |
| `browser_bookmark_search` | `browser.bookmarkSearch` | — | `query`, `text` | Array of browser bookmark records. | Requires a user-granted optional Chrome permission and explicit Host approval. |
| `browser_downloads_search` | `browser.downloadsSearch` | — | `query` | Array of browser download metadata records. | Sensitive download metadata requires explicit user approval. |

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

Equivalent Windows-safe Node CLI sequence using the `Invoke-LingeeBrowserJson` stdin helper defined in [examples.md](examples.md):

```powershell
node "<skill-root>/scripts/invoke.mjs" instances
Invoke-LingeeBrowserJson bridge.getInfo '{}'
Invoke-LingeeBrowserJson policy.get '{}'
Invoke-LingeeBrowserJson policy.allowHost '{"host":"example.com"}'
Invoke-LingeeBrowserJson browser.openTab '{"url":"https://example.com"}'
Invoke-LingeeBrowserJson browser.domSnapshot '{"tabId":7}'
Invoke-LingeeBrowserJson browser.click '{"tabId":7,"locator":{"role":"link","name":"More information"}}'
Invoke-LingeeBrowserJson browser.readText '{"tabId":7}'
```

Use the actual `tabId` returned by `browser.openTab`; `7` only shows how values flow between calls.

## Locator and coordinate rules

Construct locators in this order: stable `testId`; role plus accessible name; label; exact visible text; stable CSS. A locator must resolve to exactly one visible element. On `LOCATOR_NOT_FOUND` or `LOCATOR_AMBIGUOUS`, re-read DOM/accessibility state and refine the semantic locator. Only after repeated semantic inspection fails may a fresh screenshot support a coordinate action. Read state immediately afterward.
