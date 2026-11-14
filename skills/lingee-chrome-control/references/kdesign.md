# KDesign and KDesign Pro browser control

This reference covers browser operation, not application development. KDesign and KDesign Pro do not receive private Bridge RPC methods. Use the same standard MCP or CLI calls documented in `tools.md`, then compose them into component-aware workflows.

The maintained regression baseline is KDesign `1.8.74` plus the inspected KDesign Pro public templates. The project test lab covers 62 KDesign component routes and 22 KDesign Pro page routes; 41 component and 15 Pro-page deep interactions have passed real-Chrome regression.

## Contents

- [Shared rules](#shared-rules)
- [MCP and CLI equivalence](#mcp-and-cli-equivalence)
- [KDesign component patterns](#kdesign-component-patterns)
- [KDesign Pro page patterns](#kdesign-pro-page-patterns)
- [Workflow runner](#workflow-runner)
- [Failure handling](#failure-handling)

## Shared rules

1. Inspect the current page with `browser.domSnapshot`, locator queries, or the accessibility tree. Do not assume the official demo DOM exactly matches a business application.
2. Scope CSS locators to a stable page, form, panel, row, or `data-testid` container. KDesign popup content is often portaled under `document.body`, so its panel locator may be global while its trigger locator remains scoped.
3. Prefer `testId`, role/name, label, exact text, then stable CSS. KDesign CSS classes are a last semantic option and must be re-read after a library upgrade.
4. Use `browser.selectOption` only for a native HTML `<select>`. KDesign `Select`, `Cascader`, `TreeSelect`, `CityPicker`, and similar composite controls require visible trigger/panel/option clicks.
5. After every action, verify a visible value, selected state, output text, URL, row count, modal state, or other deterministic result. A successful click acknowledgement alone is not completion.
6. Do not retry `POINTER_INPUT_TIMEOUT` blindly. Inspect the original tab and any newly opened tabs. For a disposable test tab, a runner may close that tab, create a fresh controlled test tab, and restart the current idempotent case; never apply that recovery to an unknown business mutation.

## MCP and CLI equivalence

The following two calls are equivalent. Use the direct MCP form when the `universalChrome` server is available; otherwise use the bundled CLI from the loaded Skill root.

Direct MCP:

```text
browser_click({"tabId":123,"locator":{"role":"button","name":"查询","exact":true}})
browser_locator_text_content({"tabId":123,"locator":{"testId":"query-result"},"maxChars":1000})
```

CLI:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":123,"locator":{"role":"button","name":"查询","exact":true}}'
node "<skill-root>/scripts/invoke.mjs" call browser.locatorTextContent '{"tabId":123,"locator":{"testId":"query-result"},"maxChars":1000}'
```

Keep one `UNIVERSAL_BROWSER_INSTANCE_ID` and one non-secret `UNIVERSAL_BROWSER_SESSION_ID` for the task.

## KDesign component patterns

### Button, Link, Menu, Tabs, Pagination

- Read and count the target first; disambiguate repeated labels with a containing `testId` or stable CSS scope.
- Use `browser.click` for the visible action.
- For Tabs and Pagination, verify both the selected marker and the newly visible content or page number.
- For navigation links, register `browser.expectNavigation` before the click.

### Input, Search, InputNumber, Stepper

- Use `browser.fill` for ordinary controlled inputs and verify the final visible/state value.
- Use `browser.press` with `Enter` for Search only after focusing or filling the intended search input.
- If a formatted numeric input clamps or reformats intermediate values, read the final value/state before deciding whether a retry is safe. Do not use page script to assign the value.
- Stepper increase/decrease controls are visible pointer actions; click the uniquely scoped step button and verify the numeric state.

### Checkbox, Radio, Switch

- Use `browser.setChecked` for real checkbox/radio inputs because it is idempotent and verifies the final checked state.
- Some KDesign Switch versions render a clickable composite element without a semantic switch role. Scope its stable root CSS, use `browser.click`, then verify the displayed or application state.
- For group/select-all behavior, verify the individual count and the group summary, including indeterminate state where exposed.

### Select, Cascader, TreeSelect, CityPicker, BaseData

These are composite controls, not native selects:

1. Click or fill the scoped trigger/input.
2. Wait for the popup panel or for the root's documented visible/open class.
3. Locate one option inside the current panel. Avoid an unscoped text locator when the same label also appears in the trigger or page body.
4. Click the option and verify the displayed selection or application callback state.

Typical CLI sequence:

```powershell
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":123,"locator":{"css":"[data-testid=department-field] .kd-select-selector"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.waitFor '{"tabId":123,"locator":{"css":".kd-select-dropdown"},"state":"visible","timeoutMs":5000}'
node "<skill-root>/scripts/invoke.mjs" call browser.click '{"tabId":123,"locator":{"css":".kd-select-dropdown [title=销售部]"}}'
node "<skill-root>/scripts/invoke.mjs" call browser.locatorTextContent '{"tabId":123,"locator":{"testId":"department-value"},"maxChars":1000}'
```

If the installed KDesign version exposes a different panel class, re-read the DOM and update only the locator; do not change the control surface.

### DatePicker and ColorPicker

- Click the scoped input/container, wait for the portaled panel, then click a uniquely scoped day or preset color.
- Prefer a stable attribute or selected/today class over a bare day number, which is usually repeated across adjacent months.
- Verify the formatted field value or state output after the panel closes.

### Form

- Fill each visible field through its standard control method.
- Blur when the framework commits values on blur.
- Click the submit button once, then verify the submitted state or validation errors.
- A validation message is a result, not permission to bypass required fields.

### Table and Transfer

- Scope Table locators to the intended table and row. Use `setChecked` on a real row-selection checkbox; otherwise click a unique row action.
- Verify selected-row summary, row class, or downstream toolbar state.
- For Transfer, select the source item first, verify the direction button is enabled, click it, then verify the item appears in the target list.

### Slider, SplitPanel, drag targets

- Use `browser.drag` with unique locator endpoints when both endpoints are representable.
- If geometry is unavoidable, take a fresh screenshot and use current viewport points only.
- Verify the changed value or panel size/fold state after the drag or fold click.

### Modal, Drawer, Dropdown, Popconfirm, Collapse

- Click the trigger, wait for visible overlay/content, and verify its title/body.
- For Popconfirm, opening the prompt and confirming are separate actions. Obtain any required business confirmation immediately before the confirm action.
- When closing with `Escape`, verify the overlay becomes hidden or detached.

### Message and Notification

- Click the trigger and verify both the application state and the visible toast/notification text.
- Use bounded waits because these overlays may disappear automatically.

### Upload and FileChooser

- For an explicit CSS file input, use `browser.setFileInput` with reviewed absolute regular-file paths.
- For a dynamic/hidden chooser, register `browser.waitForFileChooser` before clicking, then call `browser.setFileChooserFiles` with the returned chooser ID.
- Verify only file basenames or page status; never read file contents unless separately authorized.

### Signature, ImageCropper, Carousel, Tree, Tag

- Signature/ImageCropper: click the trigger, verify the editor/canvas/image surface is present, and do not synthesize drawing events with page JavaScript.
- Carousel: click a stable dot/arrow and verify the active slide or change callback state.
- Tree: use a scoped node key/class or unique title; verify selection/expansion state.
- Closable Tag: verify the close control exists for the current tag type before clicking it, then verify removal or callback state.

### Tooltip and hover-only behavior

There is no framework-specific hover RPC. Prefer structural/accessibility verification. If the user must visibly demonstrate hover behavior, use a fresh screenshot and `browser.mouseMove` with current viewport coordinates, then verify the tooltip; never reuse coordinates after layout or navigation changes.

## KDesign Pro page patterns

KDesign Pro pages are templates, not a stable automation protocol. Do not encode `kdesignPro.*` Bridge methods. Build page-specific locators from the deployed application.

### Workbench

- Verify metric cards and quick-entry labels.
- Scope row selection to the intended workbench table and verify the selected-row summary.
- Treat shortcut buttons that create records as consequential when they lead to real submissions.

### Detail pages

- Cross-tab detail: click the scoped tab and verify its panel content.
- Vertical/anchor detail: click the scoped action or navigation item and verify the target section/state.
- Flow detail: verify the current Step marker and visible business data; do not infer completion from the diagram alone.

### List pages

1. Fill the operation-bar filters.
2. Use visible custom-select patterns for KDesign Select fields.
3. Click the uniquely scoped query button.
4. Wait for loading to finish or the result state to change.
5. Verify row count, table text, pagination, or an explicit query result marker.

For tree/list pages, select the organization node before querying and verify that the table reflects the selected scope. For inline-form lists, fill the inline inputs, add one row, and verify the new row before any save action.

### Report pages

- Query with the operation bar and verify the report result or table state.
- Read charts through accessible labels or deterministic summary text where possible; do not estimate values from pixels when exact text exists.
- Downloads must use `browser.waitForDownload` registered before the export click.

### Form pages

- Basic, guide, anchor, vertical-tab, and preview layouts share the same rule: scope the field, fill it, commit blur if needed, submit once, then verify success or validation state.
- Navigate visible steps/tabs rather than directly changing the URL to imitate a user action.
- File attachments use the standard FileChooser lifecycle.

### Login page

- Never request or handle a real password through the model-visible channel.
- If login, MFA, CAPTCHA, or tenant choice is required, stop for the user to complete it interactively.
- Test fixtures may use explicitly non-secret synthetic values; production authentication may not.

## Workflow runner

The bundled runner validates method names before it connects. It cannot call raw CDP or unknown methods.

```powershell
node "<skill-root>/scripts/run-workflow.mjs" list "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" validate "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123
```

Override an exact placeholder with JSON:

```powershell
node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123 --var 'TRIGGER_LOCATOR={"testId":"department-trigger"}' --var 'OPTION_LOCATOR={"role":"option","name":"销售部","exact":true}'
```

The runner supports `equals`, `includes`, `matches`, `min`, and `max` expectations, optionally against a dotted `path` in the returned value. Review every workflow and locator before running it against a business page.

## Failure handling

- `LOCATOR_NOT_FOUND` / `LOCATOR_AMBIGUOUS`: re-read current DOM/accessibility state and refine the locator.
- Popup did not appear: verify the trigger actually reached an open/visible state before changing panel selectors.
- `POINTER_INPUT_TIMEOUT`: inspect page/new-tab state first. Do not repeat a business mutation blindly.
- KDesign upgrade: rerun the application regression, update scoped CSS patterns only where required, and keep generic Bridge methods unchanged.
- Standard method cannot express the action: stop and report the missing generic capability. Do not use raw CDP or page JavaScript.
