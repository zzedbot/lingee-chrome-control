# Standard workflow examples

All examples use the bundled CLI; each Bridge method has an equivalent MCP tool in `tools.md`. Resolve `<skill-root>` to the absolute directory containing `SKILL.md`. Keep the same non-secret session ID for the whole task, and set an instance ID explicitly when discovery returns more than one instance.

PowerShell setup:

```powershell
$env:LINGEE_BROWSER_INSTANCE_ID = "<confirmed-instance-id>"
$env:LINGEE_BROWSER_SESSION_ID = "lingee-task-20261113"
```

PowerShell-safe parameter input (required for every non-empty object on Windows):

```powershell
@{
  tabId = 123
  locator = @{ role = "button"; name = "保存"; exact = $true }
} | ConvertTo-Json -Depth 20 -Compress |
  node "<skill-root>/scripts/invoke.mjs" call browser.click --params-stdin
```

For generated or reviewed JSON, use a file instead:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.click --params-file "C:\Temp\lingee-browser-params.json"
```

Never pass JSON directly after the method name on Windows, even when it is enclosed in single quotes. For compact examples below, use this stdin helper; it parses the reviewed JSON inside PowerShell and sends canonical JSON through standard input rather than through the process argument boundary:

```powershell
function Invoke-LingeeBrowserJson([string]$Method, [string]$Json) {
  $Json | ConvertFrom-Json | ConvertTo-Json -Depth 20 -Compress |
    node "<skill-root>/scripts/invoke.mjs" call $Method --params-stdin
}
```

Prefer a native PowerShell hashtable pipeline for generated values. The helper is for the fixed reviewed examples in this reference, not for constructing JSON by string concatenation.

## Discover, diagnose, and preflight

```powershell
node "<skill-root>/scripts/invoke.mjs" instances
node "<skill-root>/scripts/doctor.mjs"
node "<skill-root>/scripts/preflight.mjs"
```

If multiple instances exist, choose one before any status call. The reports omit tokens and pipe endpoints.

## Read, claim, locate, click, and verify

```powershell
Invoke-LingeeBrowserJson bridge.getInfo '{}'
Invoke-LingeeBrowserJson policy.get '{}'
Invoke-LingeeBrowserJson browser.listTabs '{}'
Invoke-LingeeBrowserJson browser.claimTab '{"tabId":123}'
Invoke-LingeeBrowserJson browser.domSnapshot '{"tabId":123,"maxNodes":500,"maxTextChars":30000}'
Invoke-LingeeBrowserJson browser.locatorCount '{"tabId":123,"locator":{"role":"button","name":"保存","exact":true}}'
Invoke-LingeeBrowserJson browser.click '{"tabId":123,"locator":{"role":"button","name":"保存","exact":true}}'
Invoke-LingeeBrowserJson browser.locatorInnerText '{"tabId":123,"locator":{"testId":"save-status"},"maxChars":1000}'
```

Other supported locator forms:

```json
{"css":"#submit"}
{"role":"link","name":"详情","exact":true}
{"label":"用户名","exact":true}
{"text":"操作成功","exact":true}
{"testId":"primary-action"}
```

## Frames and nested Frames

`framePath` is ordered outer-to-inner and uses the same locator grammar:

```powershell
Invoke-LingeeBrowserJson browser.click '{"tabId":123,"framePath":[{"css":"iframe#outer"},{"css":"iframe[title=content-frame]"}],"locator":{"role":"button","name":"提交","exact":true}}'
Invoke-LingeeBrowserJson browser.waitFor '{"tabId":123,"framePath":[{"css":"iframe#outer"}],"locator":{"text":"已完成","exact":true},"state":"visible","timeoutMs":10000}'
```

Re-read after Frame navigation. Never reuse a locator context after `FRAME_CONTEXT_CHANGED`.

## Navigation and waits

```powershell
Invoke-LingeeBrowserJson browser.expectNavigation '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"link","name":"下一页","exact":true}}},"url":"*/next*","match":"glob","waitUntil":"domcontentloaded","timeoutMs":30000}'
Invoke-LingeeBrowserJson browser.waitForURL '{"tabId":123,"url":"/next","match":"contains","waitUntil":"load","timeoutMs":30000}'
Invoke-LingeeBrowserJson browser.waitForLoadState '{"tabId":123,"state":"networkidle","timeoutMs":30000}'
```

## Forms and common controls

```powershell
Invoke-LingeeBrowserJson browser.fill '{"tabId":123,"locator":{"label":"标题"},"value":"季度总结"}'
Invoke-LingeeBrowserJson browser.check '{"tabId":123,"locator":{"label":"同意条款"}}'
Invoke-LingeeBrowserJson browser.setChecked '{"tabId":123,"locator":{"testId":"notify"},"checked":false}'
Invoke-LingeeBrowserJson browser.selectOption '{"tabId":123,"locator":{"label":"地区"},"options":{"label":"上海"}}'
Invoke-LingeeBrowserJson browser.selectOption '{"tabId":123,"locator":{"label":"技能"},"options":[{"value":"js"},{"index":2}]}'
Invoke-LingeeBrowserJson browser.doubleClick '{"tabId":123,"locator":{"testId":"editable-row"}}'
Invoke-LingeeBrowserJson browser.pressSequentially '{"tabId":123,"locator":{"label":"备注"},"text":"逐字输入示例","delayMs":80,"timeoutMs":10000}'
Invoke-LingeeBrowserJson browser.press '{"tabId":123,"key":"Enter","locator":{"label":"搜索"}}'
```

Read every filled field back with `browser.locatorState` and require the exact value before continuing. Use a unique test code supplied by the caller or generated from the current timestamp; do not reuse fixed values such as `TEST001` across regression runs.

## Consequential save with transient feedback

Finish every field and switch change before preparing the intent. The nested feedback action installs its observer before the visible save click, so a short-lived `保存成功` message cannot disappear between model turns:

```powershell
Invoke-LingeeBrowserJson browser.prepareActionIntent '{"tabId":123,"actionType":"record-create","summary":"保存已逐字段核验的唯一测试记录 TEST-OACONN-20261117-000001（Mock模式=开）","dataTypes":["测试基础资料文本"],"action":{"method":"browser.performAndWaitForFeedback","params":{"action":{"method":"browser.click","params":{"locator":{"css":"#bar_save"}}},"text":"保存成功","exact":false,"timeoutMs":10000}}}'
Invoke-LingeeBrowserJson browser.confirmActionIntent '{"intentId":"<intent-id-from-result>","decision":"approve"}'
Invoke-LingeeBrowserJson browser.executeActionIntent '{"intentId":"<intent-id-from-result>"}'
```

If any controlled input, switch, click, navigation, or reload occurs after preparation, execution returns `ACTION_INTENT_STALE`; prepare and present a new final intent. A returned feedback message is supplementary evidence only. Next verify a record ID/status, matching list row, or deliberately reopen the record and read back its unique code and required fields.

## Visible pointer, coordinates, drag, and scroll

Use coordinates only after a fresh screenshot and semantic retries:

```powershell
Invoke-LingeeBrowserJson browser.screenshot '{"tabId":123,"format":"png"}'
Invoke-LingeeBrowserJson browser.mouseMove '{"tabId":123,"observationId":"<observation-id-from-immediately-preceding-screenshot>","x":640,"y":360}'
Invoke-LingeeBrowserJson browser.coordinateClick '{"tabId":123,"observationId":"<fresh-observation-id>","x":640,"y":360,"button":"left","clickCount":1}'
Invoke-LingeeBrowserJson browser.drag '{"tabId":123,"observationId":"<fresh-observation-id>","from":{"locator":{"testId":"card-a"}},"to":{"locator":{"testId":"column-done"}},"steps":18}'
Invoke-LingeeBrowserJson browser.wheel '{"tabId":123,"observationId":"<fresh-observation-id>","x":900,"y":600,"deltaY":480}'
Invoke-LingeeBrowserJson browser.scroll '{"tabId":123,"observationId":"<fresh-observation-id>","deltaY":600}'
```

Capture a new viewport PNG before every coordinate operation above. An observation is single-use and the result returns the shared `operationSequence` for visual feedback and actual input.

For responsive checks, read the current viewport, apply one bounded temporary profile, capture fresh evidence, and reset it:

```powershell
Invoke-LingeeBrowserJson browser.getViewport '{"tabId":123}'
Invoke-LingeeBrowserJson browser.setViewport '{"tabId":123,"width":390,"height":844,"deviceScaleFactor":3,"mobile":true}'
Invoke-LingeeBrowserJson browser.screenshot '{"tabId":123,"format":"png"}'
Invoke-LingeeBrowserJson browser.resetViewport '{"tabId":123}'
```

Viewport overrides are temporary by default and are also reset by `browser.endSession`. Use `preserveOnSessionEnd:true` only when the user explicitly asks to keep the emulated viewport.

## Downloads

Register the expectation before the reviewed action:

```powershell
Invoke-LingeeBrowserJson browser.waitForDownload '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"button","name":"下载报告","exact":true}}},"timeoutMs":60000}'
Invoke-LingeeBrowserJson browser.downloadMedia '{"tabId":123,"locator":{"role":"link","name":"下载原图"},"timeoutMs":60000}'
```

Do not execute a downloaded file automatically.

## File chooser and file input

Use only reviewed absolute paths to existing regular files:

```powershell
Invoke-LingeeBrowserJson browser.waitForFileChooser '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"button","name":"选择文件","exact":true}}},"timeoutMs":15000}'
Invoke-LingeeBrowserJson browser.prepareActionIntent '{"tabId":123,"actionType":"upload","summary":"Upload approved report.pdf","dataTypes":["application/pdf"],"action":{"method":"browser.setFileChooserFiles","params":{"chooserId":"<chooser-id-from-result>","files":["C:\\approved\\report.pdf"]}}}'
Invoke-LingeeBrowserJson browser.confirmActionIntent '{"intentId":"<intent-id-from-result>","decision":"approve"}'
Invoke-LingeeBrowserJson browser.executeActionIntent '{"intentId":"<intent-id-from-result>"}'
```

For a CSS input, prepare the same `upload` intent with nested method `browser.setFileInput` and exact `selector`/`files`. Never call either upload method directly.

## JavaScript dialogs

An action may return `dialogOpened`. Read the current dialog, retain its ID, then handle that exact dialog:

```powershell
Invoke-LingeeBrowserJson browser.getDialog '{"tabId":123}'
Invoke-LingeeBrowserJson browser.handleDialog '{"tabId":123,"dialogId":"<current-dialog-id>","accept":true,"promptText":"approved value"}'
```

Confirm consequential accept/dismiss decisions before handling.

## Events and console logs

```powershell
Invoke-LingeeBrowserJson browser.getEvents '{"tabId":123,"afterSequence":0,"limit":100,"methods":["Page.frameNavigated","Page.javascriptDialogOpening"]}'
Invoke-LingeeBrowserJson browser.getConsoleLogs '{"tabId":123,"afterSequence":0,"limit":100,"levels":["warning","error"],"text":"failed"}'
```

Continue pagination from the returned sequence cursor.

## Multiple sessions and ownership transfer

Session A owns the tab and transfers it to an explicit non-secret Session B:

```powershell
$env:LINGEE_BROWSER_SESSION_ID = "lingee-session-a"
Invoke-LingeeBrowserJson browser.claimTab '{"tabId":123}'
Invoke-LingeeBrowserJson browser.getLease '{"tabId":123}'
Invoke-LingeeBrowserJson browser.transferTab '{"tabId":123,"targetSessionId":"lingee-session-b"}'
```

Read-only calls may be shared; mutating calls require ownership.

## Browser session clipboard

The clipboard is private Host memory for the current `LINGEE_BROWSER_SESSION_ID`; it is not the Windows or browser-global clipboard. Obtain separate explicit approvals before enabling read and write:

```powershell
Invoke-LingeeBrowserJson policy.setSessionClipboardWrite '{"enabled":true}'
Invoke-LingeeBrowserJson browser.sessionClipboardWrite '{"items":[{"mimeType":"text/plain","data":"reviewed text"},{"mimeType":"text/markdown","data":"**reviewed text**"}]}'

Invoke-LingeeBrowserJson policy.setSessionClipboardRead '{"enabled":true}'
Invoke-LingeeBrowserJson browser.sessionClipboardRead '{"mimeTypes":["text/plain"]}'
Invoke-LingeeBrowserJson browser.sessionClipboardClear '{}'
Invoke-LingeeBrowserJson policy.setSessionClipboardRead '{"enabled":false}'
Invoke-LingeeBrowserJson policy.setSessionClipboardWrite '{"enabled":false}'
```

`text/html` is stored as inert UTF-8 data. `image/png` requires `{"encoding":"base64"}` and a canonical Base64 PNG payload. Other binary MIME types are rejected. `browser.endSession` clears remaining entries automatically.

## Export reviewed current-document resources

List the current document first, review the returned approved URLs, then export only the required opaque IDs while the document remains unchanged:

```powershell
Invoke-LingeeBrowserJson browser.listObservedResources '{"tabId":123,"types":["Stylesheet","Image"],"maxResults":50}'
Invoke-LingeeBrowserJson browser.exportObservedResources '{"tabId":123,"resourceIds":["<resource-id>"]}'
```

The result is a bounded session-temporary ZIP with a manifest. Deliver or copy the approved artifact before `browser.endSession`; session cleanup removes it. Navigation invalidates prior IDs. Do not replace this workflow with a caller-supplied URL, hidden download endpoint, cookie reuse, raw CDP, or page script.

## Preserve output and end the task

```powershell
Invoke-LingeeBrowserJson browser.markDeliverable '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.endSession
```

Use `browser.markHandoff` instead when a later session should continue the tab. Always inspect the returned closed and preserved tab results.

## Validated KDesign workflow templates

The Skill bundles reusable, editable examples:

```powershell
node "<skill-root>/scripts/run-workflow.mjs" list "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" validate "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123

node "<skill-root>/scripts/run-workflow.mjs" list "<skill-root>/examples/kdesign-pro-pages.json"
node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-pro-pages.json" --workflow query-list --tab-id 123
```

For typed workflow variables on PowerShell 5.1, avoid inline `NAME=JSON` objects:

```powershell
@{
  TRIGGER_LOCATOR = @{ testId = "department-trigger" }
  OPTION_LOCATOR = @{ role = "option"; name = "销售部"; exact = $true }
} | ConvertTo-Json -Depth 20 -Compress |
  node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123 --vars-stdin
```

Read [kdesign.md](kdesign.md) before adapting the locators. These files demonstrate standard high-level calls; they are not new KDesign-specific Bridge methods.
