# Structured troubleshooting

Recover the failed layer without installing software, starting processes, mutating policy, or operating a page speculatively. Preserve the restriction until the user supplies any required approval or action.

## Recovery sequence

1. Record the exact sanitized error code, intended instance ID, and last verified read-only result. Never record descriptor tokens, private URLs, page screenshots, cookies, or authorization headers.
2. Prefer `bridge_list_instances`, then `bridge_status`. Without MCP, resolve `<skill-root>` as the absolute directory containing the loaded `SKILL.md`. For a read-only structured report, run `node "<skill-root>/scripts/doctor.mjs"`; use `node "<skill-root>/scripts/invoke.mjs" instances` / `node "<skill-root>/scripts/invoke.mjs" call bridge.getInfo '{}'` for focused checks.
3. Classify the error before changing anything. Apply one recovery action at the failed layer.
4. Recheck in this order: instance discovery, selected-instance bridge status, `extensionConnected`, harmless tab listing, effective policy, then target state.
5. Continue with one narrow action only after every preceding check passes. Re-read the target state after the action.

## `doctor.mjs` interpretation

Run `node "<skill-root>/scripts/doctor.mjs"`. It emits one JSON report and does not install software, start processes, change policy, operate a browser page, or clean stale bridge runtime descriptors. Its `discovery` section reports the resolved runtime directory, descriptor and connectable counts, live-PID status, and sanitized per-attempt pipe error codes and timings. It never reports a pipe endpoint, bearer token, descriptor contents, or raw error message. Ordinary discovery retries the local pipe three times and removes a descriptor only after its recorded PID is confirmed dead. Use the first failed check to choose exactly one next action.

| Failed check | Next action |
|---|---|
| `node` | Install or select Node.js 22+ |
| `bridgeClient` | Reinstall the complete Skill package, including `scripts/runtime/` |
| `instances` | Start Chrome and verify Native Host registration |
| `connection` | Open extension status and verify Native Messaging connectivity |

## Lingee Build permission mode on Windows

Lingee Build's **工作区内修改** execution mode does not permit the task process to connect to the Bridge's Windows named pipe outside the workspace. A confirmed signature is:

- `discovery.runtimeDirectory` is correct;
- `descriptorCount` is greater than zero;
- the descriptor's `processAlive` is `true`;
- `connectableCount` remains zero inside Lingee Build;
- the same descriptor is connectable from a host with unrestricted local access.

Ask the user to make this change in the Lingee Build UI:

1. Stop browser-control retries and open the current task or session's execution-permission menu.
2. Change **工作区内修改** to **完全访问** and acknowledge that this grants the task broader access to the local machine.
3. If the running task retains its old permission snapshot, start a new run or session.
4. Run `node "<skill-root>/scripts/doctor.mjs"` again. Continue only when `connectableCount >= 1`, `instances.ok = true`, and `extensionConnected = true`.
5. After browser-control work, the user may restore **工作区内修改** for unrelated tasks.

Do not weaken named-pipe ACLs, run as administrator, copy runtime tokens, disable the sandbox globally, or treat **完全访问** as browser/site authorization. Host allowlists, sensitive-metadata gates, CDP restrictions, authentication boundaries, and confirmation requirements remain unchanged.

## Error handling

| Code | Meaning | Smallest safe response |
|---|---|---|
| `BRIDGE_ROOT_NOT_FOUND` | An explicitly configured development override does not point to a valid Bridge project root. | Correct or unset `UNIVERSAL_CHROME_BRIDGE_ROOT`; ordinary installed Skills use the bundled client and do not need this variable. |
| `INVALID_ARGUMENTS` | The CLI received missing, malformed, or extra arguments. | Read the emitted usage, correct the command or JSON, and retry; no Bridge operation ran. |
| `NONSTANDARD_BROWSER_CONTROL_BLOCKED` | The Skill CLI rejected a raw CDP, page-script, unknown, or otherwise nonstandard Bridge method before connecting to Chrome. | Use the matching documented high-level MCP/CLI method. If none exists, stop and report the missing standard capability; do not change browser-control surfaces. |
| `INVOCATION_FAILED` | The invocation wrapper or Bridge Client failed without a more specific stable code. | Run `node "<skill-root>/scripts/doctor.mjs"` for read-only layer checks, preserve the sanitized error, and verify target state before any retry. |
| `BRIDGE_CLIENT_UNAVAILABLE` | The bundled runtime is missing or the selected development client lacks required exports. | Reinstall the complete Skill package and verify `scripts/runtime/bridge-client.mjs`; do not substitute an untrusted client module. |
| `BRIDGE_INSTANCES_INVALID` | The Bridge Client returned an instance list that is not an array. | Stop and verify the repository and Bridge Client versions match before listing instances again. |
| `BRIDGE_INSTANCE_SELECTION_REQUIRED` | More than one live Chrome Bridge instance exists and none was selected. | Ask the user which Chrome instance to use, then set `UNIVERSAL_BROWSER_INSTANCE_ID`; do not infer a profile from tab titles. |
| `BRIDGE_NOT_FOUND` | No live Native Host descriptor was discovered for the selected instance. | Ask the user to open Chrome with the approved bridge extension enabled. Use the extension popup's Reconnect control or restart Chrome, then list instances again. Do not install or enable components without authorization. |
| `BRIDGE_PROBE_FAILED` | One or more runtime descriptors exist, but every sanitized local-pipe probe failed after retries. | Read `discovery.descriptors[].probe.attempts`: `PIPE_PROBE_TIMEOUT` indicates timeout; `EACCES`/`EPERM` indicates an execution identity or sandbox boundary; `ENOENT` indicates the named pipe is absent. In Lingee Build on Windows, if the descriptor exists and its PID is alive, guide the user from **工作区内修改** to **完全访问**, then start a new run if necessary and rerun `node "<skill-root>/scripts/doctor.mjs"`. Preserve the descriptor and do not call destructive discovery repeatedly. |
| `EXTENSION_NOT_READY` | The Native Host exists, but the Chrome extension handshake is incomplete. | Ask the user to verify the expected profile and extension, reconnect, then repeat `bridge_status`. |
| `AUTH_FAILED` | The runtime descriptor token is missing, invalid, stale, or inconsistent. | Never manufacture, copy, edit, or expose a token. Ask the user to reconnect the extension or restart Chrome so the legitimate host regenerates state. |
| `SITE_APPROVAL_REQUIRED` | The target host is not allowed by the effective policy. | Name the exact host and request approval before `policy_allow_host`. Do not substitute `policy_set_allow_all`. |
| `SITE_BLOCKED` | The extension-side blocklist rejected the target host. | Preserve the block, report it, and ask the user to change that specific block if intended. |
| `SENSITIVE_METADATA_APPROVAL_REQUIRED` | Sensitive history, bookmark, or download metadata access is disabled. | Explain the exact metadata need and request explicit approval. Do not use page scripts or another profile as a workaround. |
| `LOCATOR_NOT_FOUND` | The semantic locator matched no visible element. | Re-read DOM or accessibility state, check the current tab and page, then build a narrower semantic locator. Do not jump to coordinates after one failure. |
| `LOCATOR_AMBIGUOUS` | The semantic locator matched more than one visible element. | Re-read state and add stable role/name, label, exact text, test ID, or CSS evidence until one visible element remains. |
| `LOCATOR_WAIT_TIMEOUT` | A locator did not reach the requested attached, detached, visible, hidden, enabled, or disabled state within the bounded timeout. | Re-read the current document and locator count; verify whether navigation replaced the target before choosing a new wait or action. |
| `URL_WAIT_TIMEOUT` | The top-level URL did not satisfy the requested exact, contains, or glob match in time. | Read the current tab URL and load state, then determine whether navigation failed, redirected, or already reached a different approved destination. |
| `FRAME_NOT_FOUND` | One segment of the ordered Frame path no longer resolves. | Re-read the top document and rebuild the entire outer-to-inner Frame path. |
| `FRAME_INACCESSIBLE` | The requested Frame exists but the isolated execution context is unavailable. | Wait for the Frame to finish loading, then retry one read; do not fall back to page script or the top document. |
| `FRAME_CONTEXT_CHANGED` | Frame navigation or replacement invalidated the prior isolated context. | Re-read the page and rebuild both Frame path and target locator before any new action. |
| `TAB_NOT_CLAIMED` | The current session attempted an owned mutation without first claiming the tab. | Claim the intended approved tab, re-read its state, then issue one reviewed action. |
| `TAB_OWNED_BY_ANOTHER_SESSION` | Another session currently owns the tab's exclusive mutation lease. | Use read-only inspection, ask for an explicit transfer, or wait for the owner to end; never infer or expose the other session ID. |
| `INPUT_TIMEOUT` | Sequential or synchronized input exceeded its bounded total timeout and may be incomplete. | Read the final control value and page state before deciding whether any remaining input is safe. |
| `DOWNLOAD_TIMEOUT` | No completed download matching the registered action arrived before timeout. | Inspect the action result and download UI without executing files; verify whether the site opened a new tab or blocked the download. |
| `FILE_CHOOSER_TIMEOUT` | The reviewed action did not produce a capturable file chooser in time. | Re-read the trigger and retry once with the expectation registered before the action; do not script the page. |
| `FILE_CHOOSER_EXPIRED` | The captured chooser ID is no longer active. | Trigger and capture a new chooser, then use only the new ID and reviewed absolute files. |
| `BROWSER_TIMEOUT` | A browser operation exceeded its timeout and may have partially completed. | Recheck bridge status and current target state. Determine whether the prior action occurred before deciding whether to retry. |
| `FOREIGN_FRAME_MONITOR_FAILED` | The controlled-tab monitor could not be installed before debugger attachment. | Re-read the tab and extension status, reload the unpacked extension if its files changed, and retry one claim. Do not disable other extensions or broaden Chrome flags as a workaround. |
| `CURSOR_RENDER_FAILED` | Required virtual-pointer feedback was not visibly painted in the browser top layer, so the extension did not dispatch the corresponding pointer input. | Verify the tab is still an ordinary injectable web page and the current extension is loaded. Re-read the tab, then retry once only after the cursor is visible. |
| `CURSOR_DOCUMENT_CHANGED` | Top-level navigation replaced the document while visual feedback and browser input were being synchronized, so the extension stopped the action. | Wait for navigation to settle, re-read the page and rebuild the locator or fresh coordinates before issuing a new action. Never reuse the interrupted action's coordinates. |
| `CURSOR_POSITION_MISMATCH` | The painted virtual pointer did not reach the requested viewport coordinates, so the extension did not dispatch the corresponding pointer input. | Capture fresh page evidence and recalculate the target. If it repeats, stop and report the mismatch instead of retrying the same coordinates. |
| `POINTER_CONTROL_LOST` | The tab lost the bridge's debugger control before synchronized pointer input could be dispatched. | Recheck bridge and tab state, claim the intended tab again if still authorized, then re-read the target before acting. |
| `CLEANUP_TIMEOUT` | Session cleanup did not finish within its bounded deadline. | Inspect the returned preserved tabs and current leases; do not close user or unsaved tabs speculatively. |
| `DEBUGGER_DETACH_TIMEOUT` | Debugger detachment did not acknowledge before the cleanup deadline. | Recheck tab control state and allow Chrome to settle; do not repeatedly detach or close the tab blindly. |
| `MONITOR_CLEANUP_TIMEOUT` | Controlled-tab monitor cleanup did not acknowledge before the cleanup deadline. | Recheck the tab and extension state; preserve the tab and report the cleanup failure rather than weakening the monitor. |

## Multiple instances or tabs

List live instances and use the user-confirmed ID through `UNIVERSAL_BROWSER_INSTANCE_ID`. Do not guess a profile from sensitive tab titles. List tabs, expect unapproved details to be redacted, and ask the user when multiple candidates remain plausible.

## Authentication boundary

If login, MFA, CAPTCHA, consent requiring personal judgment, or another security challenge blocks progress, stop. Ask the user to complete the challenge in Chrome and report readiness. “Use another source” authorizes only a legitimate public or already-approved source for the same information need; it never authorizes bypassing access control or transferring a signed-in session.

## Failed recovery report

Return the failed layer, sanitized code, checks that passed, checks that were skipped, and the smallest user action or approval needed. Do not claim a script, component, or capability was used unless its observable result was captured.
