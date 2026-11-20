# KDesign and KDesign Pro browser control

This reference covers browser operation, not application development. KDesign and KDesign Pro do not receive private Bridge RPC methods. Use the same standard MCP or CLI calls documented in `tools.md`, then compose them into component-aware workflows.

The maintained regression baseline is KDesign `1.8.74` plus the inspected KDesign Pro public templates. The project test lab covers 62 KDesign component routes and 22 KDesign Pro page routes; 41 component and 15 Pro-page deep interactions have passed real-Chrome regression.

## Contents

- [Shared rules](#shared-rules)
- [MCP and CLI equivalence](#mcp-and-cli-equivalence)
- [KDesign component patterns](#kdesign-component-patterns)
- [KDesign Pro page patterns](#kdesign-pro-page-patterns)
- [Kingdee business-page lifecycle](#kingdee-business-page-lifecycle)
- [Workflow runner](#workflow-runner)
- [Failure handling](#failure-handling)

## Shared rules

1. Inspect the current page with `browser.domSnapshot`, locator queries, or the accessibility tree. For generic pointer-styled controls use `browser.domSnapshot` with `includeGenericClickable:true`; use `browser.locatorDescribeAll` to compare candidates and `browser.locatorState` to read one current field/state. Do not assume the official demo DOM exactly matches a business application.
2. Scope CSS locators to a stable page, form, panel, row, or `data-testid` container. KDesign popup content is often portaled under `document.body`, so its panel locator may be global while its trigger locator remains scoped.
3. Prefer `testId`, role/name, label, exact text, then stable CSS. KDesign CSS classes are a last semantic option and must be re-read after a library upgrade.
4. Use `browser.selectOption` only for a native HTML `<select>`. KDesign `Select`, `Cascader`, `TreeSelect`, `CityPicker`, and similar composite controls require visible trigger/panel/option clicks.
5. After every action, verify a visible value, selected state, output text, URL, row count, modal state, or other deterministic result. A successful click acknowledgement alone is not completion.
6. Do not retry `POINTER_INPUT_TIMEOUT` blindly. Inspect the original tab and any newly opened tabs. For a disposable test tab, a runner may close that tab, create a fresh controlled test tab, and restart the current idempotent case; never apply that recovery to an unknown business mutation.
7. For Kingdee business controls rendered as generic `div` elements, combine a stable CSS scope with exact visible text, for example `{ "css": "div", "text": "新增", "exact": true }`. A bare text locator searches the semantic-interactive candidate set and may intentionally exclude generic containers. Verify the combined locator is unique before acting; do not fall back to coordinates when this structured combination works.

## MCP and CLI equivalence

The following two calls are equivalent. Use the direct MCP form when the `lingeeBrowser` server is available; otherwise use the bundled CLI from the loaded Skill root.

Direct MCP:

```text
browser_click({"tabId":123,"locator":{"role":"button","name":"查询","exact":true}})
browser_locator_text_content({"tabId":123,"locator":{"testId":"query-result"},"maxChars":1000})
```

Windows-safe CLI using the `Invoke-LingeeBrowserJson` stdin helper defined in [examples.md](examples.md):

```powershell
Invoke-LingeeBrowserJson browser.click '{"tabId":123,"locator":{"role":"button","name":"查询","exact":true}}'
Invoke-LingeeBrowserJson browser.locatorTextContent '{"tabId":123,"locator":{"testId":"query-result"},"maxChars":1000}'
```

Keep one `LINGEE_BROWSER_INSTANCE_ID` and one non-secret `LINGEE_BROWSER_SESSION_ID` for the task.

## KDesign component patterns

### Button, Link, Menu, Tabs, Pagination

- Read and count the target first; disambiguate repeated labels with a containing `testId` or stable CSS scope.
- Use `browser.click` for the visible action.
- For Tabs and Pagination, verify both the selected marker and the newly visible content or page number.
- For navigation links, register `browser.expectNavigation` before the click.

### Input, Search, InputNumber, Stepper

- Use `browser.fill` for ordinary controlled inputs. Version 0.1.32 atomically replaces existing controlled-input text and verifies the final value before reporting success.
- Use `browser.press` with `Enter` for Search only after focusing or filling the intended search input.
- If a formatted numeric input clamps or reformats intermediate values, read the final value/state before deciding whether a retry is safe. Do not use page script to assign the value.
- Stepper increase/decrease controls are visible pointer actions; click the uniquely scoped step button and verify the numeric state.

### Checkbox, Radio, Switch

- Use `browser.setChecked` for real checkbox/radio inputs because it is idempotent and verifies the final checked state.
- Some KDesign Switch versions render a clickable composite element without a semantic switch role. Scope its stable root CSS, use `browser.click`, then verify the displayed or application state.
- For group/select-all behavior, verify the individual count and the group summary, including indeterminate state where exposed.

### Select, Cascader, TreeSelect, CityPicker, BaseData

These are composite controls, not native selects:

For a single-select Cascader, prefer the scoped `.kd-cascader-single-wrapper` trigger over its read-only `input`. KDesign places a visible label span over that input and handles opening from the wrapper, so targeting the input can correctly fail the Bridge obstruction check.

For CityPicker search, click the scoped `.kd-city-picker-selector` first and then use `browser.type` on the focused search input. The component can place its selected-value span over the internal input, so a direct `browser.fill` on that hidden hit target should remain blocked.

TreeSelect has the same composite-input shape: open it through the scoped visible `.kd-tree-select-icon-arrow`, then verify `.kd-tree-select-visible` before locating tree options. The outer `.kd-tree-select-selector` can be a zero-size focus container, and the internal input or placeholder can be covered or non-hit-testable; they are not reliable pointer targets.

1. Click or fill the scoped trigger/input.
2. Wait for the popup panel or for the root's documented visible/open class.
3. Locate one option inside the current panel. Avoid an unscoped text locator when the same label also appears in the trigger or page body.
4. Click the option and verify the displayed selection or application callback state.

Typical CLI sequence:

```powershell
Invoke-LingeeBrowserJson browser.click '{"tabId":123,"locator":{"css":"[data-testid=department-field] .kd-select-selector"}}'
Invoke-LingeeBrowserJson browser.waitFor '{"tabId":123,"locator":{"css":".kd-select-dropdown"},"state":"visible","timeoutMs":5000}'
Invoke-LingeeBrowserJson browser.click '{"tabId":123,"locator":{"css":".kd-select-dropdown [title=销售部]"}}'
Invoke-LingeeBrowserJson browser.locatorTextContent '{"tabId":123,"locator":{"testId":"department-value"},"maxChars":1000}'
```

If the installed KDesign version exposes a different panel class, re-read the DOM and update only the locator; do not change the control surface.

### DatePicker and ColorPicker

- Click the scoped input/container, wait for the portaled panel, then click a uniquely scoped day or preset color.
- Prefer a stable attribute or selected/today class over a bare day number, which is usually repeated across adjacent months.
- Verify the formatted field value or state output after the panel closes.

### Form

- Fill each visible field through its standard control method, then read the same field with `browser.locatorState` and require its exact `value` before continuing. The workflow runner stops on the first failed expectation; do not parse its JSON output with regular expressions to infer success.
- Blur when the framework commits values on blur.
- Never guess a save shortcut. Find the exact visible toolbar action, require one match, and use `record-create`, `record-update`, or `record-submit` action intent as appropriate.
- Click the submit button once, then verify durable application state: record number/status, a matching row after returning to the list, or a deliberate reopen/readback. A click acknowledgement or toast alone is insufficient.
- A validation message is a result, not permission to bypass required fields.

### Table and Transfer

- Scope Table locators to the intended table and row. Use `setChecked` on a real row-selection checkbox; otherwise click a unique row action.
- Verify selected-row summary, row class, or downstream toolbar state.
- For Transfer, select the source item first, verify the direction button is enabled, click it, then verify the item appears in the target list.

### Slider, SplitPanel, drag targets

- Use `browser.drag` with unique locator endpoints when both endpoints are representable, but still include a fresh viewport-PNG `observationId` because drag changes page state through coordinates.
- If geometry is unavoidable, take a fresh screenshot and use current viewport points only.
- Verify the changed value or panel size/fold state after the drag or fold click.

### Modal, Drawer, Dropdown, Popconfirm, Collapse

- Click the trigger, wait for visible overlay/content, and verify its title/body.
- For Popconfirm, opening the prompt and confirming are separate actions. Obtain any required business confirmation immediately before the confirm action.
- When closing with `Escape`, verify the overlay becomes hidden or detached.

### Message and Notification

- Use `browser.performAndWaitForFeedback` so the bounded observer is registered before the visible trigger click. Match the expected Message/Toast/Notification text and retain the returned appearance/disappearance metadata even if the node is removed before the next model turn.
- Verify both the captured feedback and the durable application state. Feedback alone never proves that a record was persisted.
- Use bounded waits because these overlays may disappear automatically.

### Upload and FileChooser

- For an explicit CSS file input, prepare an `upload` action intent whose exact nested action is `browser.setFileInput` with reviewed absolute regular-file paths; confirm and execute the intent.
- For a dynamic/hidden chooser, register `browser.waitForFileChooser` before clicking, then prepare, confirm, and execute an `upload` action intent containing `browser.setFileChooserFiles` and the returned chooser ID.
- Verify only file basenames or page status; never read file contents unless separately authorized.

### Signature, ImageCropper, Carousel, Tree, Tag

- Signature/ImageCropper: click the trigger, verify the editor/canvas/image surface is present, and do not synthesize drawing events with page JavaScript.
- Carousel: click a stable dot/arrow and verify the active slide or change callback state.
- Tree: use a scoped node key/class or unique title; verify selection/expansion state.
- Closable Tag: verify the close control exists for the current tag type before clicking it, then verify removal or callback state.

### Tooltip and hover-only behavior

There is no framework-specific hover RPC. Prefer structural/accessibility verification. If the user must visibly demonstrate hover behavior, use a fresh viewport PNG and pass its `observationId` to `browser.mouseMove` with current coordinates, then verify the tooltip; capture a new observation for every later coordinate action.

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

## Kingdee business-page lifecycle

Many Kingdee/iERP pages combine KDesign-derived widgets with application-owned generic `div` controls. They remain controllable through the standard Locator surface; they do not justify a framework-specific RPC, screenshot, coordinate, raw CDP, or page-script fallback.

### Discovery and disambiguation

- A generic toolbar action can be located by stable CSS plus exact visible text: `{ "css": "div", "text": "新增", "exact": true }`. Call `browser.locatorCount` first and require exactly one result.
- If the same application name appears in a navigation tree and a card, scope the card by its stable container or use its complete composite visible text. Never click an ambiguous short label.
- Leaf text in a custom confirmation overlay can be scoped with `*:not(:has(*))` plus exact text after verifying uniqueness. Do not nest `:has()` inside another `:has()` because Chrome rejects nested relational selectors.
- A split toolbar button may expose its primary action and dropdown arrow as sibling children. Scope the stable split-button root, click the direct arrow child, wait for the menu item, then locate that item by exact text. Verify the menu action's resulting document state.
- Prefer a real row checkbox with `browser.setChecked`. Verify the selected-row summary or enabled toolbar state before issuing a record action.

### Create, modify, submit, audit, reverse-audit, delete

1. Read the page and uniquely locate `新增`; click once and wait for the edit form.
2. Fill code/name/remark inputs with `browser.fill`. Version 0.1.32 uses the browser's native `selectAll` editing command, inserts the replacement atomically, and verifies the final focused editable value. A returned `valueLength` is evidence that the exact requested value was reached; `CONTROL_STATE_MISMATCH` is a hard failure.
3. Save once, then verify the visible success state and read the record back from the page.
4. For submit and audit, verify the current record identity and status immediately before each click, then verify the next status. Do not infer success from a click acknowledgement.
5. For reverse-audit, select exactly one row, open the scoped audit split menu, choose `反审核`, and verify the status changed to the expected editable/draft state.
6. For delete, select exactly one reviewed test record and open the page confirmation overlay. Prepare a `delete` action intent whose nested action is the exact `browser.click` on the unique confirm locator. Present the returned origin, summary, data types, risk class, and expiry. Only after explicit user approval call `browser.confirmActionIntent` and `browser.executeActionIntent`; then verify both code and name are absent. Never put confirm/execute into an unattended workflow.

The bundled `examples/kingdee-business-page.json` contains reusable standard-control workflows for generic div actions, verified controlled-input replacement, split-button menus, row selection, and deletion-intent preparation. All locators are examples and must be re-read and overridden for the deployed page.

## Workflow runner

The bundled runner validates method names before it connects. It cannot call raw CDP or unknown methods.

```powershell
node "<skill-root>/scripts/run-workflow.mjs" list "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" validate "<skill-root>/examples/kdesign-components.json"
node "<skill-root>/scripts/run-workflow.mjs" validate "<skill-root>/examples/kingdee-business-page.json"
node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123
```

Override an exact placeholder with JSON:

```powershell
@{
  TRIGGER_LOCATOR = @{ testId = "department-trigger" }
  OPTION_LOCATOR = @{ role = "option"; name = "销售部"; exact = $true }
} | ConvertTo-Json -Depth 20 -Compress |
  node "<skill-root>/scripts/run-workflow.mjs" run "<skill-root>/examples/kdesign-components.json" --workflow custom-select --tab-id 123 --vars-stdin
```

The runner supports `equals`, `includes`, `matches`, `min`, and `max` expectations, optionally against a dotted `path` in the returned value. Review every workflow and locator before running it against a business page.

## Failure handling

- `LOCATOR_NOT_FOUND` / `LOCATOR_AMBIGUOUS`: re-read current DOM/accessibility state and refine the locator.
- Popup did not appear: verify the trigger actually reached an open/visible state before changing panel selectors.
- `POINTER_INPUT_TIMEOUT`: inspect page/new-tab state first. Do not repeat a business mutation blindly.
- KDesign upgrade: rerun the application regression, update scoped CSS patterns only where required, and keep generic Bridge methods unchanged.
- Standard method cannot express the action: stop and report the missing generic capability. Do not use raw CDP or page JavaScript.
