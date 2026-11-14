import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectBridge, listBridgeInstances } from "../src/bridge-client.mjs";
import { coveredMethods } from "../test/web-fixture/capability-cases.mjs";
import { STANDARD_CAPABILITIES } from "../skills/lingee-chrome-control/scripts/runtime/standard-capabilities.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = path.join(repoRoot, "test", "web-fixture");
const distRoot = path.join(fixtureRoot, "dist");
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
if (!hostAllowed(policy, "127.0.0.1") || !hostAllowed(policy, "localhost")) {
  server.close();
  throw Object.assign(new Error("Approve the exact hosts 127.0.0.1 and localhost before running the web fixture; the runner never changes policy."), { code: "SITE_APPROVAL_REQUIRED" });
}

let tabId;
let childTabId;
const checks = [];
let stage = "start";
try {
  await checked("bridge.getInfo", () => bridge.call("bridge.getInfo", {}));
  await checked("browser.getInfo", () => bridge.call("browser.getInfo", {}));
  await checked("browser.listTabs", () => bridge.call("browser.listTabs", {}));

  const tab = await checked("browser.openTab", () => openFixtureTab(`${baseUrl}/#/lab`, true));
  tabId = tab.id;
  await waitForComplete(tabId);
  await checked("browser.getTab", () => bridge.call("browser.getTab", { tabId }));
  await checked("browser.activateTab", () => bridge.call("browser.activateTab", { tabId }));
  await checked("browser.claimTab", () => bridge.call("browser.claimTab", { tabId }));
  const lease = await checked("browser.getLease", () => bridge.call("browser.getLease", { tabId }));
  assert.equal(lease.ownedByCurrentSession, true);

  const text = await checked("browser.readText", () => bridge.call("browser.readText", { tabId, maxChars: 10000 }));
  assert.match(text.text, /全能力实验室/);
  const snapshot = await checked("browser.domSnapshot", () => bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000, maxTextChars: 20000 }));
  assert.ok(snapshot.nodes.some(({ selector }) => selector === "#native-click"));
  const ax = await checked("browser.accessibilitySnapshot", () => bridge.call("browser.accessibilitySnapshot", { tabId }));
  assert.ok(ax);
  const screenshot = await checked("browser.screenshot", () => bridge.call("browser.screenshot", { tabId, format: "png" }));
  assert.match(screenshot.mimeType, /^image\/png$/);
  assert.ok(screenshot.data.length > 1000);

  assert.equal(await checked("browser.locatorCount", () => bridge.call("browser.locatorCount", { tabId, locator: { css: ".locator-query-item" } })), 2);
  assert.deepEqual(await checked("browser.locatorAllTextContents", () => bridge.call("browser.locatorAllTextContents", { tabId, locator: { css: ".locator-query-item" }, maxResults: 10 })), ["查询文本 Alpha", "查询文本 Beta"]);
  assert.equal(await checked("browser.locatorInnerText", () => bridge.call("browser.locatorInnerText", { tabId, locator: { testId: "locator-query-first" } })), "查询文本 Alpha");
  assert.equal(await checked("browser.locatorTextContent", () => bridge.call("browser.locatorTextContent", { tabId, locator: { testId: "locator-query-hidden" } })), "查询文本 Beta");
  assert.equal(await checked("browser.locatorGetAttribute", () => bridge.call("browser.locatorGetAttribute", { tabId, locator: { testId: "locator-query-first" }, name: "data-query-kind" })), "first");
  assert.equal(await checked("browser.locatorIsVisible", () => bridge.call("browser.locatorIsVisible", { tabId, locator: { testId: "locator-query-hidden" } })), false);
  assert.equal(await checked("browser.locatorIsEnabled", () => bridge.call("browser.locatorIsEnabled", { tabId, locator: { testId: "locator-query-disabled" } })), false);
  await checked("browser.waitForLoadState", () => bridge.call("browser.waitForLoadState", { tabId, state: "load", timeoutMs: 5000 }));
  await checked("browser.waitForURL", () => bridge.call("browser.waitForURL", { tabId, url: `${baseUrl}/#/lab`, match: "exact", timeoutMs: 5000 }));
  await checked("browser.click-start-async", () => bridge.call("browser.click", { tabId, locator: { testId: "start-async-target" } }));
  await checked("browser.waitFor", () => bridge.call("browser.waitFor", { tabId, locator: { testId: "async-target" }, state: "visible", timeoutMs: 5000 }));

  const outerFrame = [{ testId: "frame-shell" }];
  const nestedFrame = [{ testId: "frame-shell" }, { testId: "inner-frame" }];
  assert.equal(await checked("browser.locatorTextContent-frame", () => bridge.call("browser.locatorTextContent", { tabId, framePath: outerFrame, locator: { testId: "frame-button" } })), "Frame target");
  await checked("browser.click-frame-locator", () => bridge.call("browser.click", { tabId, framePath: outerFrame, locator: { testId: "frame-button" } }));
  await expectText(/frame-target:ok/);
  await checked("browser.fill-frame-locator", () => bridge.call("browser.fill", { tabId, framePath: outerFrame, locator: { testId: "frame-input" }, value: "Frame Fill" }));
  await expectText(/frame-input:Frame Fill/);
  await checked("browser.click-nested-frame", () => bridge.call("browser.click", { tabId, framePath: nestedFrame, locator: { testId: "nested-frame-button" } }));
  await expectText(/nested-frame:ok/);
  await checked("browser.click-cross-origin-frame", () => bridge.call("browser.click", { tabId, framePath: [{ testId: "cross-frame" }], locator: { testId: "frame-button" } }));
  await expectText(/frame-target:ok/);
  await checked("browser.frame-ambiguous-gate", () => expectCode("FRAME_AMBIGUOUS", () => bridge.call("browser.locatorCount", { tabId, framePath: [{ css: ".ambiguous-frame" }], locator: { css: "button" } })));

  await checked("browser.click", () => bridge.call("browser.click", { tabId, locator: { testId: "native-click" } }));
  await expectText(/native-click:ok/);
  await checked("browser.fill", () => bridge.call("browser.fill", { tabId, locator: { testId: "native-fill" }, value: "Lingee Fill" }));
  await checked("browser.click-focus", () => bridge.call("browser.click", { tabId, locator: { testId: "native-key" } }));
  await checked("browser.press", () => bridge.call("browser.press", { tabId, key: "Enter" }));
  await checked("browser.click-type-focus", () => bridge.call("browser.click", { tabId, locator: { testId: "native-type" } }));
  await checked("browser.type", () => bridge.call("browser.type", { tabId, text: "Lingee Type" }));
  await expectLocatorText({ testId: "semantic-result" }, /fill=Lingee Fill.*type=Lingee Type.*key=Enter/s);
  await checked("browser.check", () => bridge.call("browser.check", { tabId, locator: { testId: "native-check" } }));
  await expectLocatorText({ testId: "semantic-result" }, /checked=true/);
  await checked("browser.uncheck", () => bridge.call("browser.uncheck", { tabId, locator: { testId: "native-check" } }));
  await expectLocatorText({ testId: "semantic-result" }, /checked=false/);
  await checked("browser.setChecked", () => bridge.call("browser.setChecked", { tabId, locator: { testId: "native-check" }, checked: true }));
  await checked("browser.selectOption", () => bridge.call("browser.selectOption", { tabId, locator: { testId: "native-select" }, options: { label: "Beta" } }));
  await expectLocatorText({ testId: "semantic-result" }, /select=beta/);
  await checked("browser.doubleClick", () => bridge.call("browser.doubleClick", { tabId, locator: { testId: "double-click" } }));
  await expectLocatorText({ testId: "semantic-result" }, /double-click:ok/);
  await checked("browser.pressSequentially", () => bridge.call("browser.pressSequentially", { tabId, locator: { testId: "sequential-input" }, text: "Lingee", delayMs: 20, timeoutMs: 5000 }));
  await expectLocatorText({ testId: "semantic-result" }, /sequential:Lingee/);

  const coordinate = nodeRect(await bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000 }), "#coordinate-target");
  const coordinatePoint = center(coordinate);
  await checked("browser.mouseMove", () => bridge.call("browser.mouseMove", { tabId, ...coordinatePoint }));
  await checked("browser.coordinateClick", () => bridge.call("browser.coordinateClick", { tabId, ...coordinatePoint }));
  await expectText(/coordinate:/);
  const handle = nodeRect(await bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000 }), "#drag-handle");
  await checked("browser.drag", () => bridge.call("browser.drag", { tabId, from: center(handle), to: { x: center(handle).x + 180, y: center(handle).y }, steps: 12 }));
  await expectText(/drag=(1[0-9]{2}|2[0-9]{2})/);

  await checked("browser.scroll", () => bridge.call("browser.scroll", { tabId, deltaY: 500 }));
  const wheelRect = nodeRect(await bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000 }), "#wheel-zone");
  await checked("browser.wheel", () => bridge.call("browser.wheel", { tabId, ...center(wheelRect), deltaY: 180 }));
  await waitForRectMovement("#wheel-zone", wheelRect.y);

  await checked("browser.scroll-long-page", () => bridge.call("browser.scroll", { tabId, deltaY: 900 }));
  await checked("browser.click-scroll-destination", () => bridge.call("browser.click", { tabId, locator: { testId: "scroll-destination" } }));
  await expectText(/scroll-target:ok/);

  const uploadPath = path.join(fixtureRoot, "fixtures", "upload.txt");
  await checked("browser.setFileInput", () => bridge.call("browser.setFileInput", { tabId, selector: "[data-testid='file-input']", files: [uploadPath] }));
  await expectText(/file:upload\.txt/);
  await checked("browser.setFileInput-frame", () => bridge.call("browser.setFileInput", { tabId, framePath: outerFrame, selector: "[data-testid='frame-file']", files: [uploadPath] }));
  await expectText(/frame-file:upload\.txt/);
  const chooserResult = await checked("browser.waitForFileChooser", () => bridge.call("browser.waitForFileChooser", { tabId, action: { method: "browser.click", params: { locator: { testId: "open-file-chooser" } } }, timeoutMs: 5000 }));
  assert.equal(chooserResult.isMultiple, true);
  await checked("browser.setFileChooserFiles", () => bridge.call("browser.setFileChooserFiles", { tabId, chooserId: chooserResult.chooserId, files: [uploadPath] }));
  await expectText(/chooser:upload\.txt/);

  await handleTestDialog({ testId: "confirm-dialog" }, { accept: true });
  await expectText(/dialog:accepted/);
  await handleTestDialog({ testId: "prompt-dialog" }, { accept: true, promptText: "Lingee Prompt" });
  await expectText(/prompt:Lingee Prompt/);

  const download = await checked("browser.waitForDownload", () => bridge.call("browser.waitForDownload", { tabId, action: { method: "browser.click", params: { locator: { testId: "download-link" } } }, timeoutMs: 10000 }));
  assert.equal(download.download.suggestedFilename, "lingee-test.txt");
  assert.equal(download.download.state, "complete");
  const mediaDownload = await checked("browser.downloadMedia", () => bridge.call("browser.downloadMedia", { tabId, locator: { testId: "download-link" }, timeoutMs: 10000 }));
  assert.equal(mediaDownload.download.state, "complete");
  await checked("browser.click-console-log", () => bridge.call("browser.click", { tabId, locator: { testId: "console-log" } }));
  const consoleResult = await checked("browser.getConsoleLogs", () => bridge.call("browser.getConsoleLogs", { tabId, levels: ["warning"], text: "Lingee structured", limit: 20 }));
  assert.ok(consoleResult.logs.some((entry) => /Lingee structured warning/.test(entry.text)));

  await checked("browser.scroll-frame", () => bridge.call("browser.scroll", { tabId, deltaY: 2000 }));
  const frameRect = nodeRect(await bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000 }), "#frame-shell");
  await checked("browser.screenshot-frame", () => bridge.call("browser.screenshot", { tabId, format: "png" }));
  await checked("browser.coordinateClick-frame", () => bridge.call("browser.coordinateClick", { tabId, x: frameRect.x + 230, y: frameRect.y + 52 }));
  await expectLocatorText({ testId: "semantic-result" }, /frame-coordinate:ok/);
  await checked("browser.click-frame-navigation", () => bridge.call("browser.click", { tabId, framePath: outerFrame, locator: { testId: "frame-navigate" } }));
  await checked("browser.waitFor-frame-navigation", () => bridge.call("browser.waitFor", { tabId, framePath: outerFrame, locator: { testId: "frame-alt-target" }, state: "visible", timeoutMs: 5000 }));
  await checked("browser.click-remove-frame", () => bridge.call("browser.click", { tabId, locator: { testId: "remove-frame" } }));
  await checked("browser.waitFor-frame-detached", () => bridge.call("browser.waitFor", { tabId, framePath: outerFrame, locator: { testId: "frame-alt-target" }, state: "detached", timeoutMs: 5000 }));
  await checked("browser.getEvents", () => bridge.call("browser.getEvents", { tabId, afterSequence: 0, limit: 100 }));

  await checked("browser.expectNavigation-spa", () => bridge.call("browser.expectNavigation", { tabId, action: { method: "browser.click", params: { locator: { testId: "navigation-link" } } }, url: `${baseUrl}/#/target`, waitUntil: "load", timeoutMs: 7000 }));
  await expectText(/navigation-target:ready[\s\S]*reloadCount=0/);
  await checked("browser.back-ui-navigation", () => bridge.call("browser.back", { tabId }));
  await expectText(/全能力实验室/);

  await checked("browser.expectNavigation-full", () => bridge.call("browser.expectNavigation", { tabId, action: { method: "browser.click", params: { locator: { testId: "full-navigation-link" } } }, url: `${baseUrl}/?full=1#/target`, waitUntil: "load", timeoutMs: 7000 }));
  await expectText(/navigation-target:ready/);
  await checked("browser.back-full-navigation", () => bridge.call("browser.back", { tabId }));
  await expectText(/全能力实验室/);

  await checked("browser.expectNavigation-redirect", () => bridge.call("browser.expectNavigation", { tabId, action: { method: "browser.click", params: { locator: { testId: "redirect-navigation-link" } } }, url: `${baseUrl}/?redirected=1#/target`, waitUntil: "load", timeoutMs: 7000 }));
  await expectText(/navigation-target:ready/);
  await checked("browser.back-redirect", () => bridge.call("browser.back", { tabId }));
  await expectText(/全能力实验室/);
  await checked("browser.waitForURL-timeout", () => expectCode("URL_WAIT_TIMEOUT", () => bridge.call("browser.waitForURL", { tabId, url: `${baseUrl}/never`, timeoutMs: 150 })));

  await checked("browser.click-reload-counter", () => bridge.call("browser.click", { tabId, locator: { testId: "reload-counter" } }));
  await waitForComplete(tabId);
  await checked("browser.click-navigation-after-reload", () => bridge.call("browser.click", { tabId, locator: { testId: "navigation-link" } }));
  await expectText(/navigation-target:ready[\s\S]*reloadCount=1/);
  await checked("browser.back-after-reload", () => bridge.call("browser.back", { tabId }));
  await expectText(/全能力实验室/);

  const existingTabIds = new Set((await bridge.call("browser.listTabs", {})).map(({ id }) => id));
  const newTabClientTimeoutMs = Number(process.env.LINGEE_NEW_TAB_CLIENT_TIMEOUT_MS) || undefined;
  const newTabClickStartedAt = Date.now();
  const newTabClick = await checked("browser.click-new-tab-link", () => bridge.call("browser.click", { tabId, locator: { testId: "new-tab-link" } }, newTabClientTimeoutMs ? { timeoutMs: newTabClientTimeoutMs } : undefined));
  const newTabClickDiagnostic = { name: "browser.click-new-tab-duration", elapsedMs: Date.now() - newTabClickStartedAt, result: newTabClick };
  checks.push(newTabClickDiagnostic);
  if (process.env.LINGEE_E2E_DEBUG === "1") process.stderr.write(`new-tab-diagnostic ${JSON.stringify(newTabClickDiagnostic)}\n`);
  const clickedChild = await waitForNewTab(existingTabIds, `${baseUrl}/?child=1#/target`);
  childTabId = clickedChild.id;
  const childText = await bridge.call("browser.readText", { tabId: childTabId, maxChars: 3000 });
  assert.match(childText.text, /navigation-target:ready/);
  await bridge.call("browser.closeTab", { tabId: childTabId });
  childTabId = undefined;
  await bridge.call("browser.activateTab", { tabId });

  await checked("browser.navigate", () => bridge.call("browser.navigate", { tabId, url: `${baseUrl}/#/target` }));
  await waitForComplete(tabId); await expectText(/navigation-target:ready/);
  await checked("browser.back", () => bridge.call("browser.back", { tabId }));
  await expectText(/全能力实验室/);
  await checked("browser.forward", () => bridge.call("browser.forward", { tabId }));
  await expectText(/navigation-target:ready/);
  await checked("browser.reload", () => bridge.call("browser.reload", { tabId }));
  await waitForComplete(tabId); await expectText(/navigation-target:ready/);

  const child = await checked("browser.openTab-child", () => openFixtureTab(`${baseUrl}/#/kdesign`, false));
  childTabId = child.id;
  await waitForComplete(childTabId);
  await checked("browser.claimTab-child", () => bridge.call("browser.claimTab", { tabId: childTabId }));
  await checked("browser.markHandoff", () => bridge.call("browser.markHandoff", { tabId: childTabId }));
  await checked("browser.markDeliverable", () => bridge.call("browser.markDeliverable", { tabId: childTabId }));
  await checked("browser.groupTabs", () => bridge.call("browser.groupTabs", { tabIds: [tabId, childTabId], title: "Lingee Web Fixture", color: "blue", collapsed: false }));
  await checked("browser.activateTab-kdesign", () => bridge.call("browser.activateTab", { tabId: childTabId }));
  await checked("browser.waitForLoadState-kdesign", () => bridge.call("browser.waitForLoadState", { tabId: childTabId, state: "load", timeoutMs: 10000 }));
  const kdesignText = await checked("browser.readText-kdesign", () => waitForPageText(childTabId, /KDesign 官方组件目录/, 10000));
  assert.match(kdesignText.text, /KDesign 官方组件目录/);
  await checked("browser.navigate-kdesign-modal", () => bridge.call("browser.navigate", { tabId: childTabId, url: `${baseUrl}/#/kdesign/modal` }));
  await checked("browser.waitForURL-kdesign-modal", () => bridge.call("browser.waitForURL", { tabId: childTabId, url: `${baseUrl}/#/kdesign/modal`, match: "exact", timeoutMs: 5000 }));
  await checked("browser.click-kdesign-modal", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "open-modal" } }));
  await checked("browser.waitFor-kdesign-modal", () => waitForVisible(childTabId, { testId: "modal-content" }, 5000));
  await checked("browser.reload-kdesign", () => bridge.call("browser.reload", { tabId: childTabId }));
  await waitForComplete(childTabId);
  await checked("browser.navigate-kdesign-drawer", () => bridge.call("browser.navigate", { tabId: childTabId, url: `${baseUrl}/#/kdesign/drawer` }));
  await checked("browser.waitForURL-kdesign-drawer", () => bridge.call("browser.waitForURL", { tabId: childTabId, url: `${baseUrl}/#/kdesign/drawer`, match: "exact", timeoutMs: 5000 }));
  await checked("browser.click-kdesign-drawer", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "open-drawer" } }));
  await checked("browser.waitFor-kdesign-drawer", () => waitForVisible(childTabId, { testId: "drawer-content" }, 5000));
  await checked("browser.navigate-kdesign-pro", () => bridge.call("browser.navigate", { tabId: childTabId, url: `${baseUrl}/#/pro/workbench` }));
  await checked("browser.waitForURL-kdesign-pro", () => bridge.call("browser.waitForURL", { tabId: childTabId, url: `${baseUrl}/#/pro/workbench`, match: "exact", timeoutMs: 5000 }));
  await checked("browser.click-pro-form", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-nav-form" } }));
  await checked("browser.click-pro-form-submit", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-form-submit" } }));
  assert.match(await bridge.call("browser.locatorTextContent", { tabId: childTabId, locator: { testId: "pro-form-result" } }), /申请已提交/);
  await checked("browser.click-pro-detail", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-nav-detail" } }));
  assert.match((await bridge.call("browser.readText", { tabId: childTabId, maxChars: 10000 })).text, /基础详情/);
  await checked("browser.click-pro-report", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-nav-report" } }));
  assert.match((await bridge.call("browser.readText", { tabId: childTabId, maxChars: 10000 })).text, /列表报表/);
  await checked("browser.click-pro-login", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-nav-login" } }));
  await checked("browser.fill-pro-login-user", () => bridge.call("browser.fill", { tabId: childTabId, locator: { testId: "pro-login-user" }, value: "lingee-test-user" }));
  await checked("browser.fill-pro-login-password", () => bridge.call("browser.fill", { tabId: childTabId, locator: { testId: "pro-login-password" }, value: "fixture-only-value" }));
  await checked("browser.click-pro-login-submit", () => bridge.call("browser.click", { tabId: childTabId, locator: { testId: "pro-login-submit" } }));
  assert.match(await bridge.call("browser.locatorTextContent", { tabId: childTabId, locator: { testId: "pro-login-result" } }), /模拟登录成功/);
  await checked("browser.activateTab-lab", () => bridge.call("browser.activateTab", { tabId }));

  for (const method of ["browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"]) {
    await checked(method, async () => {
      try {
        return await bridge.call(method, method === "browser.bookmarkSearch" ? { text: "lingee-fixture-no-match" } : { query: { text: "lingee-fixture-no-match" }, text: "lingee-fixture-no-match", maxResults: 5 });
      } catch (error) {
        if (!policy.allowSensitiveMetadata) assert.equal(error.code, "SENSITIVE_METADATA_APPROVAL_REQUIRED");
        else throw error;
        return { approvalGateVerified: true };
      }
    });
  }

  const expected = new Set(["instances", ...STANDARD_CAPABILITIES.map(({ method }) => method).filter(Boolean)]);
  assert.deepEqual([...coveredMethods()].sort(), [...expected].sort());
  process.stdout.write(`${JSON.stringify({ ok: true, instanceId: selected.instanceId, baseUrl, checks, sensitiveMetadataEnabled: Boolean(policy.allowSensitiveMetadata) }, null, 2)}\n`);
} catch (error) {
  error.message = `${stage}: ${error.message}`;
  throw error;
} finally {
  if (childTabId != null) await bridge.call("browser.closeTab", { tabId: childTabId }).catch(() => {});
  if (tabId != null) {
    await bridge.call("browser.detachTab", { tabId }).catch(() => {});
    await bridge.call("browser.closeTab", { tabId }).catch(() => {});
  }
  await bridge.call("browser.endSession", {}).catch(() => {});
  server.closeIdleConnections?.(); server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
}

async function checked(name, action) {
  stage = name;
  if (process.env.LINGEE_E2E_DEBUG === "1") process.stderr.write(`start ${name}\n`);
  const result = await action();
  checks.push(name);
  if (process.env.LINGEE_E2E_DEBUG === "1") process.stderr.write(`done ${name}\n`);
  return result;
}
async function openFixtureTab(url, active) {
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try { return await bridge.call("browser.openTab", { url, active }); }
    catch (error) {
      lastError = error;
      if (!/Tabs cannot be edited right now/i.test(error.message) || attempt === 3) throw error;
      await delay(250 * (attempt + 1));
    }
  }
  throw lastError;
}
async function handleTestDialog(locator, dialog) {
  const before = await latestEventCursor();
  stage = "browser.click-dialog";
  const clickPromise = bridge.call("browser.click", { tabId, locator }, { timeoutMs: 60000 });
  await waitForDialog(before);
  const activeDialog = await checked("browser.getDialog", () => bridge.call("browser.getDialog", { tabId }));
  if (!activeDialog?.id) throw new Error("JavaScript dialog opened without a registered dialog identity");
  await checked("browser.handleDialog", () => bridge.call("browser.handleDialog", { tabId, dialogId: activeDialog.id, ...dialog }));
  const clickResult = await clickPromise;
  if (clickResult.dialogOpened !== true || clickResult.dialog?.id !== activeDialog.id) {
    throw new Error("The click result was not bound to the handled JavaScript dialog");
  }
  checks.push("browser.click-dialog");
}
async function waitForDialog(afterSequence, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const result = await bridge.call("browser.getEvents", { tabId, afterSequence, limit: 100, methods: ["Page.javascriptDialogOpening"] });
    if (result.events?.length) return result.events.at(-1);
    await delay(50);
  }
  throw new Error("JavaScript dialog did not open");
}
async function latestEventCursor() {
  let cursor = 0;
  for (;;) {
    const result = await bridge.call("browser.getEvents", { tabId, afterSequence: cursor, limit: 500 });
    cursor = result.cursor ?? cursor;
    if (!result.hasMore) return cursor;
  }
}
async function waitForDownload(afterSequence, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  let cursor = afterSequence;
  let started;
  while (Date.now() < end) {
    const result = await bridge.call("browser.getEvents", {
      tabId,
      afterSequence: cursor,
      limit: 100,
      methods: ["Page.downloadWillBegin", "Page.downloadProgress"]
    });
    cursor = result.cursor ?? cursor;
    started ??= result.events?.find(({ method }) => method === "Page.downloadWillBegin");
    const completed = result.events?.find(({ method, params }) => method === "Page.downloadProgress" && params?.state === "completed");
    if (started && completed) return { started, completed };
    await delay(50);
  }
  throw new Error("Download did not reach completed state");
}
async function waitForNewTab(existingTabIds, expectedUrl, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const tabs = await bridge.call("browser.listTabs", {});
    const created = tabs.find(({ id, url }) => !existingTabIds.has(id) && url === expectedUrl);
    if (created) return created;
    await delay(50);
  }
  throw new Error(`New tab did not open at ${expectedUrl}`);
}
async function waitForComplete(id, timeoutMs = 10000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const tab = await bridge.call("browser.getTab", { tabId: id }); if (tab.status === "complete") return; await delay(50); } throw new Error(`Tab ${id} did not load`); }
async function waitForPageText(id, pattern, timeoutMs = 10000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const result = await bridge.call("browser.readText", { tabId: id, maxChars: 30000 }); if (pattern.test(result.text)) return result; await delay(100); } throw new Error(`Page text did not match ${pattern}`); }
async function waitForVisible(id, locator, timeoutMs = 7000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { if (await bridge.call("browser.locatorIsVisible", { tabId: id, locator }, { timeoutMs: 5000 })) return true; await delay(80); } throw new Error(`Locator did not become visible: ${JSON.stringify(locator)}`); }
async function expectText(pattern, timeoutMs = 7000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const result = await bridge.call("browser.readText", { tabId, maxChars: 20000 }); if (pattern.test(result.text)) return result; await delay(80); } throw new Error(`Text did not match ${pattern}`); }
async function expectLocatorText(locator, pattern, timeoutMs = 7000) { const end = Date.now() + timeoutMs; while (Date.now() < end) { const result = await bridge.call("browser.locatorTextContent", { tabId, locator, maxChars: 10000 }); if (pattern.test(String(result ?? ""))) return result; await delay(80); } throw new Error(`Locator text did not match ${pattern}`); }
async function expectCode(code, action) { try { await action(); } catch (error) { assert.equal(error.code, code); return { code }; } throw new Error(`Expected ${code}`); }
async function waitForRectMovement(selector, initialY, timeoutMs = 7000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const snapshot = await bridge.call("browser.domSnapshot", { tabId, maxNodes: 1000 });
    const current = nodeRect(snapshot, selector);
    if (Math.abs(current.y - initialY) >= 20) return current;
    await delay(80);
  }
  throw new Error(`${selector} did not move after wheel input`);
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function nodeRect(snapshot, selector) { const node = snapshot.nodes.find((item) => item.selector === selector); assert.ok(node?.rect, `Missing rect for ${selector}`); return node.rect; }
function center(rect) { return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }; }
function hostAllowed(policy, host) { if (policy.allowAll) return !policy.blockedHosts?.includes(host); return policy.allowedHosts?.some((entry) => host === entry || host.endsWith(`.${entry}`)); }

async function serveFixture(request, response) {
  const requestUrl = new URL(request.url, "http://127.0.0.1");
  if (requestUrl.pathname === "/redirect-target") { response.writeHead(302, { location: "/?redirected=1#/target", "cache-control": "no-store" }); response.end(); return; }
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
