# Standard workflow examples

All examples use the bundled CLI; each Bridge method has an equivalent MCP tool in `tools.md`. Resolve `<skill-root>` to the absolute directory containing `SKILL.md`. Keep the same non-secret session ID for the whole task, and set an instance ID explicitly when discovery returns more than one instance.

PowerShell setup:

```powershell
$env:UNIVERSAL_BROWSER_INSTANCE_ID = "<confirmed-instance-id>"
$env:UNIVERSAL_BROWSER_SESSION_ID = "lingee-task-20261113"
```

## Discover, diagnose, and preflight

```powershell
node "<skill-root>/scripts/invoke.mjs" instances
node "<skill-root>/scripts/doctor.mjs"
node "<skill-root>/scripts/preflight.mjs"
```

If multiple instances exist, choose one before any status call. The reports omit tokens and pipe endpoints.

## Read, claim, locate, click, and verify

```powershell
node "<skill-root>/scripts/invoke.mjs" call bridge.getInfo '{}'
node "<skill-root>/scripts/invoke.mjs" call policy.get '{}'
node "<skill-root>/scripts/invoke.mjs" call browser.listTabs '{}'
node "<skill-root>/scripts/invoke.mjs" call browser.claimTab '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.domSnapshot '{"tabId":123,"maxNodes":500,"maxTextChars":30000}'
node "<skill-root>/scripts/invoke.mjs" call browser.locatorCount '{"tabId":123,"locator":{"role":"button","name":"保存","exact":true}}'
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":123,"locator":{"role":"button","name":"保存","exact":true}}'
node "<skill-root>/scripts/invoke.mjs" call browser.locatorInnerText '{"tabId":123,"locator":{"testId":"save-status"},"maxChars":1000}'
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
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":123,"framePath":[{"css":"iframe#outer"},{"css":"iframe[title=content-frame]"}],"locator":{"role":"button","name":"提交","exact":true}}'
node "<skill-root>/scripts/invoke.mjs" call browser.waitFor '{"tabId":123,"framePath":[{"css":"iframe#outer"}],"locator":{"text":"已完成","exact":true},"state":"visible","timeoutMs":10000}'
```

Re-read after Frame navigation. Never reuse a locator context after `FRAME_CONTEXT_CHANGED`.

## Navigation and waits

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.expectNavigation '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"link","name":"下一页","exact":true}}},"url":"*/next*","match":"glob","waitUntil":"domcontentloaded","timeoutMs":30000}'
node "<skill-root>/scripts/invoke.mjs" call browser.waitForURL '{"tabId":123,"url":"/next","match":"contains","waitUntil":"load","timeoutMs":30000}'
node "<skill-root>/scripts/invoke.mjs" call browser.waitForLoadState '{"tabId":123,"state":"networkidle","timeoutMs":30000}'
```

## Forms and common controls

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.fill '{"tabId":123,"locator":{"label":"标题"},"value":"季度总结"}'
node "<skill-root>/scripts/invoke.mjs" call browser.check '{"tabId":123,"locator":{"label":"同意条款"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.setChecked '{"tabId":123,"locator":{"testId":"notify"},"checked":false}'
node "<skill-root>/scripts/invoke.mjs" call browser.selectOption '{"tabId":123,"locator":{"label":"地区"},"options":{"label":"上海"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.selectOption '{"tabId":123,"locator":{"label":"技能"},"options":[{"value":"js"},{"index":2}]}'
node "<skill-root>/scripts/invoke.mjs" call browser.doubleClick '{"tabId":123,"locator":{"testId":"editable-row"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.pressSequentially '{"tabId":123,"locator":{"label":"备注"},"text":"逐字输入示例","delayMs":80,"timeoutMs":10000}'
node "<skill-root>/scripts/invoke.mjs" call browser.press '{"tabId":123,"key":"Enter","locator":{"label":"搜索"}}'
```

## Visible pointer, coordinates, drag, and scroll

Use coordinates only after a fresh screenshot and semantic retries:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.screenshot '{"tabId":123,"format":"png"}'
node "<skill-root>/scripts/invoke.mjs" call browser.mouseMove '{"tabId":123,"x":640,"y":360}'
node "<skill-root>/scripts/invoke.mjs" call browser.coordinateClick '{"tabId":123,"x":640,"y":360,"button":"left","clickCount":1}'
node "<skill-root>/scripts/invoke.mjs" call browser.drag '{"tabId":123,"from":{"locator":{"testId":"card-a"}},"to":{"locator":{"testId":"column-done"}},"steps":18}'
node "<skill-root>/scripts/invoke.mjs" call browser.wheel '{"tabId":123,"x":900,"y":600,"deltaY":480}'
node "<skill-root>/scripts/invoke.mjs" call browser.scroll '{"tabId":123,"deltaY":600}'
```

## Downloads

Register the expectation before the reviewed action:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.waitForDownload '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"button","name":"下载报告","exact":true}}},"timeoutMs":60000}'
node "<skill-root>/scripts/invoke.mjs" call browser.downloadMedia '{"tabId":123,"locator":{"role":"link","name":"下载原图"},"timeoutMs":60000}'
```

Do not execute a downloaded file automatically.

## File chooser and file input

Use only reviewed absolute paths to existing regular files:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.waitForFileChooser '{"tabId":123,"action":{"method":"browser.click","params":{"locator":{"role":"button","name":"选择文件","exact":true}}},"timeoutMs":15000}'
node "<skill-root>/scripts/invoke.mjs" call browser.setFileChooserFiles '{"tabId":123,"chooserId":"<chooser-id-from-result>","files":["C:\\approved\\report.pdf"]}'
node "<skill-root>/scripts/invoke.mjs" call browser.setFileInput '{"tabId":123,"selector":"input[type=file]","files":["C:\\approved\\report.pdf"]}'
```

## JavaScript dialogs

An action may return `dialogOpened`. Read the current dialog, retain its ID, then handle that exact dialog:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.getDialog '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.handleDialog '{"tabId":123,"dialogId":"<current-dialog-id>","accept":true,"promptText":"approved value"}'
```

Confirm consequential accept/dismiss decisions before handling.

## Events and console logs

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.getEvents '{"tabId":123,"afterSequence":0,"limit":100,"methods":["Page.frameNavigated","Page.javascriptDialogOpening"]}'
node "<skill-root>/scripts/invoke.mjs" call browser.getConsoleLogs '{"tabId":123,"afterSequence":0,"limit":100,"levels":["warning","error"],"text":"failed"}'
```

Continue pagination from the returned sequence cursor.

## Multiple sessions and ownership transfer

Session A owns the tab and transfers it to an explicit non-secret Session B:

```powershell
$env:UNIVERSAL_BROWSER_SESSION_ID = "lingee-session-a"
node "<skill-root>/scripts/invoke.mjs" call browser.claimTab '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.getLease '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.transferTab '{"tabId":123,"targetSessionId":"lingee-session-b"}'
```

Read-only calls may be shared; mutating calls require ownership.

## Preserve output and end the task

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.markDeliverable '{"tabId":123}'
node "<skill-root>/scripts/invoke.mjs" call browser.endSession '{}'
```

Use `browser.markHandoff` instead when a later session should continue the tab. Always inspect the returned closed and preserved tab results.
