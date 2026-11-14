import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectBridge, listBridgeInstances } from "../src/bridge-client.mjs";
import { KDESIGN_COMPONENTS, KDESIGN_PRO_TEMPLATES } from "../test/web-fixture/src/official-catalog.js";
import { COMPONENT_TEST_MATRIX, PRO_TEST_MATRIX } from "../test/web-fixture/official-test-matrix.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const distRoot = path.join(repoRoot, "test", "web-fixture", "dist");
const requestedBatch = process.env.KDESIGN_E2E_BATCH || "all";
const requestedComponent = process.env.KDESIGN_E2E_COMPONENT || "";
const requestedProPage = process.env.KDESIGN_E2E_PRO_PAGE || "";
await access(path.join(distRoot, "index.html"));

const instances = await listBridgeInstances();
const requestedInstanceId = process.env.UNIVERSAL_BROWSER_INSTANCE_ID;
const selected = requestedInstanceId
  ? instances.find(({ instanceId }) => instanceId === requestedInstanceId)
  : instances.length === 1 ? instances[0] : undefined;
if (!selected) throw new Error(requestedInstanceId
  ? `Bridge instance ${requestedInstanceId} is not running`
  : `Expected exactly one Bridge instance; found ${instances.length}. Set UNIVERSAL_BROWSER_INSTANCE_ID.`);

const bridge = await connectBridge({ instanceId: selected.instanceId });
const server = http.createServer(serveFixture);
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const policy = await bridge.call("policy.get", {});
if (!hostAllowed(policy, "127.0.0.1")) throw Object.assign(new Error("Approve 127.0.0.1 before running the KDesign fixture."), { code: "SITE_APPROVAL_REQUIRED" });

let tabId;
const checks = [];
const componentResults = [];
const proResults = [];
const interactedComponents = new Set();
const interactedPro = new Set();
const knownUpstreamIssues = [];
let stage = "start";
let consoleCursor = 0;
try {
  const tab = await checked("open-kdesign", () => bridge.call("browser.openTab", { url: `${baseUrl}/#/kdesign`, active: true }));
  tabId = tab.id;
  await waitForComplete(tabId);
  await checked("claim-kdesign", () => bridge.call("browser.claimTab", { tabId }));
  await checked("wait-kdesign-load", () => bridge.call("browser.waitForLoadState", { tabId, state: "load", timeoutMs: 10000 }));
  await checked("inspect-kdesign-tab", () => bridge.call("browser.getTab", { tabId }));
  await expectPageText(/KDesign 官方组件目录.*62 个独立夹具/s);
  assert.equal(await bridge.call("browser.locatorCount", { tabId, locator: { css: '[data-testid^="catalog-component-"]' } }), 62);

  if (runBatch("structure")) for (const component of KDESIGN_COMPONENTS) {
    await checked(`component:${component.id}`, async () => {
      await navigateTo(`#/kdesign/${component.id}`);
      await waitForVisible({ testId: `component-${component.id}` }, 7000);
      const text = await bridge.call("browser.locatorTextContent", { tabId, locator: { testId: `component-${component.id}` }, maxChars: 30000 });
      assert.match(String(text), new RegExp(escapeRegExp(component.sourcePath)));
      assert.doesNotMatch(String(text), /fixture failed/i);
      const testCase = COMPONENT_TEST_MATRIX[component.id];
      assert.ok(testCase, `missing component test matrix entry: ${component.id}`);
      for (const expected of testCase.expectedText || []) assert.match(String(text), new RegExp(escapeRegExp(expected)), `${component.id}: ${expected}`);
      if (testCase.minCss) assert.ok(await bridge.call("browser.locatorCount", { tabId, locator: { css: testCase.minCss[0] } }) >= testCase.minCss[1], `${component.id}: ${testCase.minCss[0]}`);
      if (testCase.minRole) assert.ok(await bridge.call("browser.locatorCount", { tabId, locator: { role: testCase.minRole[0] } }) >= testCase.minRole[1], `${component.id}: role ${testCase.minRole[0]}`);
      await assertNoFixtureErrors(`component:${component.id}`);
      componentResults.push({ id: component.id, tier: testCase.tier, route: true, structure: true, console: "clean" });
    });
  }

  if (runBatch("general")) {
  await recycleControlledTab("#/kdesign/button", "component-interactions");

  await componentInteraction("button", async () => {
    await bridge.call("browser.click", { tabId, locator: { testId: "button-primary" } });
    await expectLocatorText({ testId: "component-state-button" }, /primary-clicked/);
  });
  await componentInteraction("clipboard", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-clipboard'] .kd-clipboard" } });
    await expectLocatorText({ testId: "component-state-clipboard" }, /copied/);
  });
  await componentInteraction("link", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "link", name: "默认链接", exact: true } });
    await expectLocatorText({ testId: "component-state-link" }, /link-clicked/);
  });
  await componentInteraction("split-panel", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-split-panel'] .kd-split-trigger-arrow.left" } });
    await expectLocatorText({ testId: "component-state-split-panel" }, /fold:/);
  });
  await componentInteraction("menu", async () => {
    await bridge.call("browser.click", { tabId, locator: { text: "工作台", exact: true } });
    await expectLocatorText({ testId: "component-state-menu" }, /menu:1/);
  });
  await componentInteraction("pagination", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-pagination'] ul > li:nth-of-type(3) > button" } });
    await expectLocatorText({ testId: "component-state-pagination" }, /page:2/);
  });
  await componentInteraction("tabs", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-tabs'] .kd-tab-pane:nth-of-type(2) .kd-tab-pane-text" } });
    await expectLocatorText({ testId: "component-state-tabs" }, /tab:customers/);
    await expectPageText(/客户内容/);
  });
  await componentInteraction("input", async () => {
    await bridge.call("browser.fill", { tabId, locator: { testId: "input-basic" }, value: "星海制造" });
    await expectLocatorText({ testId: "component-state-input" }, /input:星海制造/);
  });
  await componentInteraction("checkbox", async () => {
    assert.equal(await bridge.call("browser.locatorCount", { tabId, locator: { role: "checkbox" } }), 9);
    await bridge.call("browser.setChecked", { tabId, locator: { role: "checkbox", name: "默认复选项", exact: true }, checked: true });
    await expectLocatorText({ testId: "component-state-checkbox" }, /basic:true/);
  });
  await componentInteraction("table", async () => {
    assert.equal(await bridge.call("browser.locatorCount", { tabId, locator: { role: "checkbox" } }), 3);
    await bridge.call("browser.setChecked", { tabId, locator: { css: "[data-testid='specimen-table'] tbody tr:first-child input[type='checkbox']" }, checked: true });
    await expectLocatorText({ testId: "component-state-table" }, /selected:/);
  });
  await componentInteraction("modal", async () => {
    await bridge.call("browser.click", { tabId, locator: { testId: "open-modal" } });
    await waitForVisible({ testId: "modal-content" }, 5000);
    assert.match(await bridge.call("browser.locatorTextContent", { tabId, locator: { testId: "modal-content" } }), /SO-1001/);
    await bridge.call("browser.press", { tabId, key: "Escape" });
  });
  await componentInteraction("drawer", async () => {
    await bridge.call("browser.click", { tabId, locator: { testId: "open-drawer" } });
    await waitForVisible({ testId: "drawer-content" }, 5000);
    assert.match(await bridge.call("browser.locatorTextContent", { tabId, locator: { testId: "drawer-content" } }), /星海制造/);
  });
  }

  if (runBatch("data-entry")) {
  await recycleControlledTab("#/kdesign/base-data", "data-entry-interactions");

  await componentInteraction("base-data", async () => {
    await bridge.call("browser.fill", { tabId, locator: { css: "[data-testid='base-data-control'] input" }, value: "北京" });
    await expectLocatorText({ testId: "component-state-base-data" }, /search:北京/);
  });
  await componentInteraction("cascader", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='cascader-control'] input" } });
    await bridge.call("browser.click", { tabId, locator: { text: "浙江", exact: true } });
    await bridge.call("browser.click", { tabId, locator: { text: "杭州", exact: true } });
    await expectLocatorText({ testId: "component-state-cascader" }, /hangzhou/);
  });
  await componentInteraction("city-picker", async () => {
    await bridge.call("browser.fill", { tabId, locator: { css: "[data-testid='city-picker-control'] .kd-city-picker-content-search-input" }, value: "北京" });
    await expectLocatorText({ testId: "component-state-city-picker" }, /search:北京/);
  });
  await componentInteraction("color-picker", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='color-picker-control'] .kd-color-picker-container input" } });
    await waitForVisible({ css: ".kd-color-picker-pop" }, 5000);
    assert.ok(await bridge.call("browser.locatorCount", { tabId, locator: { css: ".kd-color-picker-panel-color-box-container li" } }) > 0);
    await bridge.call("browser.click", { tabId, locator: { css: ".kd-color-picker-panel-color-box-container li:first-child" } });
    await expectLocatorText({ testId: "component-state-color-picker" }, /color:/);
  });
  await componentInteraction("date-picker", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='date-picker-control'] .kd-date-picker:first-child input" } });
    await waitForVisible({ css: ".kd-date-picker-panel" }, 5000);
    await bridge.call("browser.click", { tabId, locator: { css: ".kd-date-picker-calendar-text-today" } });
    await expectLocatorText({ testId: "component-state-date-picker" }, /date:\d/);
  });
  await componentInteraction("filter", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='filter-control'] .kd-filter-header-handle" } });
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='filter-control'] .kd-filter-body-condition-option[title='已完成']" } });
    await expectLocatorText({ testId: "component-state-filter" }, /done/);
  });
  await componentInteraction("form", async () => {
    await bridge.call("browser.fill", { tabId, locator: { testId: "form-subject" }, value: "Lingee 表单回归" });
    await expectLocatorText({ testId: "component-state-form" }, /draft:Lingee 表单回归/);
    await bridge.call("browser.press", { tabId, key: "Tab" });
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "提交", exact: true } });
    await expectLocatorText({ testId: "component-state-form" }, /submit:/);
  });
  await componentInteraction("geo-zone-picker", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='geo-zone-picker-control'] .kd-geo-zone-picker-country-arrow" } });
    const className = await bridge.call("browser.locatorGetAttribute", { tabId, locator: { css: "[data-testid='geo-zone-picker-control'] .kd-geo-zone-picker" }, name: "class" });
    assert.match(String(className), /kd-geo-zone-picker-active/);
  });
  await componentInteraction("input-number", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='input-number-control'] input" } });
    for (let index = 0; index < 4; index += 1) await bridge.call("browser.press", { tabId, key: "Backspace" });
    await bridge.call("browser.type", { tabId, text: "24" });
    await bridge.call("browser.press", { tabId, key: "Tab" });
    await expectLocatorText({ testId: "component-state-input-number" }, /blur:24/);
  });
  await componentInteraction("radio", async () => {
    await bridge.call("browser.setChecked", { tabId, locator: { role: "radio", name: "紧急", exact: true }, checked: true });
    await expectLocatorText({ testId: "component-state-radio" }, /radio:urgent/);
  });
  if (!requestedComponent) await recycleControlledTab("#/kdesign/rate", "data-entry-second-half");
  await componentInteraction("rate", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='rate-control'] .kd-rate-item:nth-child(5)" } });
    await expectLocatorText({ testId: "component-state-rate" }, /rate:5/);
  });
  await componentInteraction("search", async () => {
    await bridge.call("browser.fill", { tabId, locator: { css: "[data-testid='search-control'] input" }, value: "星瀚" });
    await bridge.call("browser.press", { tabId, key: "Enter" });
    await expectLocatorText({ testId: "component-state-search" }, /(enter|search):星瀚/);
  });
  await componentInteraction("select", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='select-control'] .kd-select-selector" } });
    const className = await bridge.call("browser.locatorGetAttribute", { tabId, locator: { css: "[data-testid='select-control'] .kd-select" }, name: "class" });
    assert.match(String(className), /kd-select-visible/);
  });
  await componentInteraction("signature", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-signature'] .kd-signature-empty" } });
    await delay(150);
    assert.ok(await bridge.call("browser.locatorCount", { tabId, locator: { css: "canvas" } }) > 0);
    await bridge.call("browser.press", { tabId, key: "Escape" });
  });
  await componentInteraction("slider", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='slider-control'] .kd-slider" } });
    await expectLocatorText({ testId: "component-state-slider" }, /slider:/);
  });
  await componentInteraction("stepper", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='stepper-control'] .kd-inputNumber-baseStep-increase" } });
    await expectLocatorText({ testId: "component-state-stepper" }, /stepper:4/);
  });
  await componentInteraction("switch", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='switch-control'] .kd-switch" } });
    await expectLocatorText({ testId: "component-state-switch" }, /switch:false/);
  });
  if (!requestedComponent) await recycleControlledTab("#/kdesign/transfer", "data-entry-final-controls");
  await componentInteraction("transfer", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-transfer'] li[title='选项 1']" } });
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-transfer'] .kd-transfer-operation button:first-child" } });
    await expectLocatorText({ testId: "component-state-transfer" }, /target:.*1/);
  });
  await componentInteraction("tree-select", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='tree-select-control'] input" } });
    const className = await bridge.call("browser.locatorGetAttribute", { tabId, locator: { css: "[data-testid='tree-select-control'] .kd-tree-select" }, name: "class" });
    assert.match(String(className), /kd-tree-select-visible/);
  });
  await componentInteraction("upload", async () => {
    const uploadPath = path.join(repoRoot, "test", "web-fixture", "README.md");
    await bridge.call("browser.setFileInput", { tabId, selector: "[data-testid='upload-control'] input[type='file']", files: [uploadPath] });
    await expectLocatorText({ testId: "component-state-upload" }, /file:README\.md/);
  });
  }

  if (runBatch("display-feedback")) {
  await recycleControlledTab("#/kdesign/carousel", "display-feedback-interactions");

  await componentInteraction("carousel", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-carousel'] .kd-carousel-slidebar-dot:nth-child(2) button" } });
    await expectLocatorText({ testId: "component-state-carousel" }, /slide:0->1/);
  });
  await componentInteraction("image-cropper", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "打开图片裁剪", exact: true } });
    await expectLocatorText({ testId: "component-state-image-cropper" }, /cropper:open/);
    await expectPageText(/编辑图片/);
    await bridge.call("browser.press", { tabId, key: "Escape" });
  });
  await componentInteraction("tag", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-tag'] .kd-tag-close-icon" } });
    await expectLocatorText({ testId: "component-state-tag" }, /tag:closed/);
  });
  await componentInteraction("tree", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-tree'] .kd-tree-node-item-finance .kd-tree-node-title" } });
    await expectLocatorText({ testId: "component-state-tree" }, /tree:finance/);
  });
  await componentInteraction("collapse", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='specimen-collapse'] .kd-collapse-panel:first-child .kd-collapse-panel-header" } });
    await expectLocatorText({ testId: "component-state-collapse" }, /collapse:audit/);
    await expectPageText(/创建人：Lingee QA/);
  });
  await componentInteraction("dropdown", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "更多操作", exact: true } });
    await expectLocatorText({ testId: "component-state-dropdown" }, /visible:true/);
  });
  if (!requestedComponent) await recycleControlledTab("#/kdesign/message", "feedback-overlays");
  await componentInteraction("message", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "Success", exact: true } });
    await expectLocatorText({ testId: "component-state-message" }, /message:success/);
    await expectPageText(/测试成功/);
  });
  await componentInteraction("notification", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "打开通知", exact: true } });
    await expectLocatorText({ testId: "component-state-notification" }, /notification:opened/);
    await expectPageText(/Lingee 确定性通知/);
  });
  await componentInteraction("popconfirm", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "删除记录", exact: true } });
    await expectLocatorText({ testId: "component-state-popconfirm" }, /visible:true/);
    await expectPageText(/确定删除这条测试记录吗/);
  });
  }

  if (runBatch("structure") || runBatch("pro")) {
  await recycleControlledTab("#/pro/workbench", "pro-structure");

  if (runBatch("structure")) for (const template of KDESIGN_PRO_TEMPLATES) {
    await checked(`pro:${template.id}`, async () => {
      await navigateTo(`#/pro/${template.id}`);
      await waitForVisible({ testId: `pro-template-${template.id}` }, 7000);
      await expectLocatorText({ testId: "pro-source-path" }, new RegExp(escapeRegExp(template.sourcePath)), 7000);
      const text = await bridge.call("browser.locatorTextContent", { tabId, locator: { testId: `pro-template-${template.id}` }, maxChars: 30000 });
      assert.match(String(text), new RegExp(escapeRegExp(template.title)));
      const testCase = PRO_TEST_MATRIX[template.id];
      assert.ok(testCase, `missing Pro test matrix entry: ${template.id}`);
      for (const expected of testCase.expectedText || []) assert.match(String(text), new RegExp(escapeRegExp(expected)), `${template.id}: ${expected}`);
      await assertNoFixtureErrors(`pro:${template.id}`);
      proResults.push({ id: template.id, tier: testCase.tier, route: true, structure: true, console: "clean" });
    });
  }

  if (runBatch("structure")) for (const [route, expected] of [["workbench", 3], ["list-basic", 4], ["report-list", 3]]) {
    await navigateTo(`#/pro/${route}`);
    assert.equal(await checked(`pro-table-selection:${route}`, () => bridge.call("browser.locatorCount", { tabId, locator: { role: "checkbox" } })), expected);
  }

  if (runBatch("pro")) {
  await recycleControlledTab("#/pro/workbench", "pro-interactions");
  await proInteraction("workbench", async () => {
    await bridge.call("browser.setChecked", { tabId, locator: { css: "[data-testid='pro-template-workbench'] tbody tr:first-child input[type='checkbox']" }, checked: true });
    await expectLocatorText({ testId: "pro-table-selection" }, /已选择 1 项/);
  });
  await proInteraction("detail-cross", async () => {
    await bridge.call("browser.click", { tabId, locator: { css: "[data-testid='pro-template-detail-cross'] .kd-tab-pane:nth-of-type(2) .kd-tab-pane-text" } });
    await expectLocatorText({ testId: "pro-detail-result" }, /tab:approval/);
    await expectPageText(/财务复核中/);
  });
  await proInteraction("detail-vertical", async () => {
    await bridge.call("browser.click", { tabId, locator: { role: "button", name: "提交审批", exact: true } });
    await expectLocatorText({ testId: "pro-detail-result" }, /submitted/);
  });
  for (const route of ["list-basic", "list-tree", "list-banner", "list-card"]) {
    await proInteraction(route, async () => {
      await bridge.call("browser.click", { tabId, locator: { testId: "pro-query" } });
      await expectLocatorText({ testId: "pro-list-result" }, /queried/);
    });
  }
  await proInteraction("list-form", async () => {
    await bridge.call("browser.click", { tabId, locator: { testId: "pro-add-row" } });
    await expectLocatorText({ testId: "pro-list-result" }, /row-created/);
  });
  if (!requestedProPage) await recycleControlledTab("#/pro/report-list", "pro-report-form-interactions");
  await proInteraction("report-list", async () => {
    await bridge.call("browser.click", { tabId, locator: { testId: "pro-query" } });
    await expectLocatorText({ testId: "pro-report-result" }, /queried/);
  });
  for (const route of ["form-basic", "form-guide", "form-anchor", "form-vertical", "form-preview"]) {
    await proInteraction(route, async () => {
      await bridge.call("browser.fill", { tabId, locator: { testId: "pro-form-subject" }, value: `Lingee ${route} 回归` });
      await bridge.call("browser.press", { tabId, key: "Tab" });
      await bridge.call("browser.click", { tabId, locator: { testId: "pro-form-submit" } });
      await expectLocatorText({ testId: "pro-form-result" }, /申请已提交/);
    });
  }
  await proInteraction("login", async () => {
    await bridge.call("browser.fill", { tabId, locator: { testId: "pro-login-user" }, value: "lingee-kdesign-test" });
    await bridge.call("browser.fill", { tabId, locator: { testId: "pro-login-password" }, value: "fixture-only-value" });
    await bridge.call("browser.click", { tabId, locator: { testId: "pro-login-submit" } });
    await expectLocatorText({ testId: "pro-login-result" }, /模拟登录成功/);
  });
  }
  }

  if (requestedBatch === "all") {
    const expectedComponentInteractions = Object.entries(COMPONENT_TEST_MATRIX).filter(([, testCase]) => testCase.tier === "interaction").map(([id]) => id);
    const expectedProInteractions = Object.entries(PRO_TEST_MATRIX).filter(([, testCase]) => testCase.tier === "interaction").map(([id]) => id);
    assert.deepEqual([...interactedComponents].sort(), expectedComponentInteractions.sort(), "every interactive KDesign component must complete its deep interaction");
    assert.deepEqual([...interactedPro].sort(), expectedProInteractions.sort(), "every interactive KDesign Pro page must complete its deep interaction");
    checks.push("interaction-coverage:components", "interaction-coverage:pro");
  }

  await assertNoFixtureErrors("final");

  process.stdout.write(`${JSON.stringify({ ok: true, instanceId: selected.instanceId, baseUrl, componentRoutes: KDESIGN_COMPONENTS.length, proTemplateRoutes: KDESIGN_PRO_TEMPLATES.length, checkCount: checks.length, interactionComponents: [...interactedComponents], interactionProPages: [...interactedPro], componentResults, proResults, knownUpstreamIssues, checks }, null, 2)}\n`);
} catch (error) {
  if (tabId != null) {
    const diagnostics = await bridge.call("browser.getConsoleLogs", { tabId, levels: ["error"], limit: 20 }).catch(() => null);
    if (diagnostics?.logs?.length) error.message = `${error.message}; console=${diagnostics.logs.map(({ text }) => text).join(" | ")}`;
  }
  error.message = `${stage}: ${error.message}`;
  throw error;
} finally {
  if (tabId != null) {
    await bridge.call("browser.detachTab", { tabId }).catch(() => {});
    await bridge.call("browser.closeTab", { tabId }).catch(() => {});
  }
  await bridge.call("browser.endSession", {}).catch(() => {});
  server.closeIdleConnections?.(); server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function checked(name, action) { stage = name; if (process.env.LINGEE_E2E_DEBUG === "1") process.stderr.write(`start ${name}\n`); const result = await action(); checks.push(name); if (process.env.LINGEE_E2E_DEBUG === "1") process.stderr.write(`done ${name}\n`); return result; }
async function componentInteraction(id, action) { if (requestedComponent && requestedComponent !== id) return; await navigateTo(`#/kdesign/${id}`); await waitForVisible({ testId: `specimen-${id}` }, 7000); await delay(180); await interactionWithFreshTabRecovery(`interaction:${id}`, `#/kdesign/${id}`, { testId: `specimen-${id}` }, action); interactedComponents.add(id); const result = componentResults.find((item) => item.id === id); if (result) result.interaction = true; await assertNoFixtureErrors(`interaction:${id}`); }
async function proInteraction(id, action) { if (requestedProPage && requestedProPage !== id) return; await navigateTo(`#/pro/${id}`); await waitForVisible({ testId: `pro-template-${id}` }, 7000); await delay(180); await interactionWithFreshTabRecovery(`pro-interaction:${id}`, `#/pro/${id}`, { testId: `pro-template-${id}` }, action); interactedPro.add(id); const result = proResults.find((item) => item.id === id); if (result) result.interaction = true; await assertNoFixtureErrors(`pro-interaction:${id}`); }
async function interactionWithFreshTabRecovery(name, hash, readyLocator, action) {
  try {
    await checked(name, action);
  } catch (error) {
    if (error?.code !== "POINTER_INPUT_TIMEOUT") throw error;
    await recycleControlledTab(hash, `${name.replace(/[^a-z0-9]+/gi, "-")}-pointer-recovery`);
    await waitForVisible(readyLocator, 7000);
    await delay(250);
    await checked(`${name}:recovered`, action);
  }
}
async function recycleControlledTab(hash, label) {
  if (tabId != null) {
    await bridge.call("browser.detachTab", { tabId }).catch(() => {});
    await bridge.call("browser.closeTab", { tabId }).catch(() => {});
  }
  const tab = await checked(`recycle:${label}`, () => bridge.call("browser.openTab", { url: `${baseUrl}/${hash}`, active: true }));
  tabId = tab.id;
  consoleCursor = 0;
  await waitForComplete(tabId);
  await bridge.call("browser.claimTab", { tabId });
  await bridge.call("browser.waitForLoadState", { tabId, state: "load", timeoutMs: 10000 });
}
async function read() { return bridge.call("browser.readText", { tabId, maxChars: 30000 }); }
async function expectPageText(pattern, timeoutMs = 10000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const value = await read(); if (pattern.test(value.text)) return value; await delay(100); } throw new Error(`Page text did not match ${pattern}`); }
async function waitForComplete(id, timeoutMs = 10000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if ((await bridge.call("browser.getTab", { tabId: id })).status === "complete") return; await delay(50); } throw new Error(`Tab ${id} did not load`); }
async function expectLocatorText(locator, pattern, timeoutMs = 7000) { const end = Date.now() + timeoutMs; let value = ""; while (Date.now() < end) { value = await bridge.call("browser.locatorTextContent", { tabId, locator, maxChars: 10000 }); if (pattern.test(String(value ?? ""))) return value; await delay(80); } throw new Error(`Locator text ${JSON.stringify(String(value ?? ""))} did not match ${pattern}`); }
async function waitForVisible(locator, timeoutMs = 7000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await bridge.call("browser.locatorIsVisible", { tabId, locator }, { timeoutMs: 5000 }).catch(() => false)) return true; await delay(80); } throw new Error(`Locator did not become visible: ${JSON.stringify(locator)}`); }
async function navigateTo(hash) { const url = `${baseUrl}/${hash}`; await bridge.call("browser.navigate", { tabId, url }); await bridge.call("browser.waitForURL", { tabId, url, match: "exact", timeoutMs: 10000 }); return url; }
async function assertNoFixtureErrors(scope) { const result = await bridge.call("browser.getConsoleLogs", { tabId, afterSequence: consoleCursor, levels: ["error"], limit: 200 }); consoleCursor = result.cursor; const fixtureErrors = result.logs.filter(({ url }) => String(url || "").startsWith(baseUrl)); const unexpected = []; for (const log of fixtureErrors) { if (/Cannot read properties of null \(reading 'clientWidth'\).*ResizeObserver/s.test(log.text)) knownUpstreamIssues.push({ scope, component: "SplitPanel", issue: "official ResizeObserver callback reads a cleared ref after unmount" }); else if (!/forwardRef render functions accept exactly two parameters|favicon\.ico/i.test(log.text)) unexpected.push(log.text); } assert.deepEqual(unexpected, [], scope); }
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function hostAllowed(policy, host) { if (policy.allowAll) return !policy.blockedHosts?.includes(host); return policy.allowedHosts?.some((entry) => host === entry || host.endsWith(`.${entry}`)); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function runBatch(name) { return requestedBatch === "all" || requestedBatch === name; }

async function serveFixture(request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  const relative = requestUrl.pathname === "/" ? "index.html" : requestUrl.pathname.slice(1);
  const filePath = path.resolve(distRoot, relative);
  if (filePath !== distRoot && !filePath.startsWith(`${distRoot}${path.sep}`)) { response.writeHead(403); response.end(); return; }
  try {
    await access(filePath);
    response.writeHead(200, { "content-type": contentType(filePath), "cache-control": "no-store" });
    createReadStream(filePath).pipe(response);
  } catch {
    const html = await readFile(path.join(distRoot, "index.html"));
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(html);
  }
}
function contentType(file) { return file.endsWith(".js") ? "text/javascript; charset=utf-8" : file.endsWith(".css") ? "text/css; charset=utf-8" : file.endsWith(".map") ? "application/json" : "text/html; charset=utf-8"; }
