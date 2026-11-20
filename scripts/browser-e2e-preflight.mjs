import assert from "node:assert/strict";
import manifest from "../extension/manifest.json" with { type: "json" };
import { VERSION } from "../src/version.mjs";

export async function verifyBrowserRuntime(bridge) {
  const status = await bridge.call("bridge.getInfo");
  assert.equal(status.extensionConnected, true, "Browser extension is not connected");
  const browser = await bridge.call("browser.getInfo");
  assert.equal(browser.version, manifest.version, "Reload the browser extension: running extension differs from source");
  assert.equal(browser.compatibility?.foreignFrameMonitor, "remove-after-blank-v11", "Reload the browser extension: foreign-frame monitor code is stale");
  assert.equal(browser.compatibility?.debuggerState, "generation-v4", "Reload the browser extension: debugger controller code is stale");
  assert.equal(browser.compatibility?.virtualCursor, "overlay-v13", "Reload the browser extension: virtual cursor code is stale");
  assert.equal(browser.compatibility?.locatorQueries, "codex-read-v3", "Reload the browser extension: inferred-label locator query code is stale");
  assert.equal(browser.compatibility?.formControls, "verified-fill-v3", "Reload the browser extension: verified form-control code is stale");
  assert.equal(browser.compatibility?.frameLocators, "isolated-world-v1", "Reload the browser extension: frame locator code is stale");
  assert.equal(browser.compatibility?.navigationWaits, "navigation-v1", "Reload the browser extension: navigation wait code is stale");
  assert.equal(browser.compatibility?.highLevelLifecycle, "codex-lifecycle-v1", "Reload the browser extension: high-level lifecycle code is stale");
  assert.equal(browser.compatibility?.sessionClipboard, "host-memory-v1", "Reload the browser extension: session clipboard capability is stale");
  assert.equal(browser.compatibility?.viewportEmulation, "viewport-v1", "Reload the browser extension: viewport emulation capability is stale");
  assert.equal(browser.compatibility?.observedResourceExport, "resource-export-v1", "Reload the browser extension: observed-resource export capability is stale");
  assert.equal(browser.compatibility?.transientFeedback, "feedback-v1", "Reload the browser extension: transient-feedback capability is stale");
  assert.equal(browser.compatibility?.actionIntents, "action-intent-v3", "Reload the browser extension: action-intent freshness capability is stale");
  assert.equal(browser.compatibility?.observationFreshness, "observation-v1", "Reload the browser extension: observation freshness capability is stale");
  assert.ok(browser.capabilities?.includes("virtualCursor"), "Reload the browser extension: virtual cursor capability is missing");
  assert.ok(browser.capabilities?.includes("locatorQueries"), "Reload the browser extension: typed locator query capability is missing");
  assert.ok(browser.capabilities?.includes("transientFeedback"), "Reload the browser extension: transient feedback capability is missing");
  assert.ok(browser.capabilities?.includes("locatorDescriptors"), "Reload the browser extension: locator descriptor capability is missing");
  assert.ok(browser.capabilities?.includes("frameLocators"), "Reload the browser extension: frame locator capability is missing");
  assert.ok(browser.capabilities?.includes("elementWaits"), "Reload the browser extension: element wait capability is missing");
  assert.ok(browser.capabilities?.includes("navigationWaits"), "Reload the browser extension: navigation wait capability is missing");
  for (const capability of ["formControls", "sessionLeases", "sessionClipboard", "viewportEmulation", "observedResourceExport", "actionIntents", "observationFreshness", "tabLifecycle", "downloadLifecycle", "fileChooserLifecycle", "consoleLogs"]) {
    assert.ok(browser.capabilities?.includes(capability), `Reload the browser extension: ${capability} capability is missing`);
  }
  assert.equal(status.version, VERSION, "Reinstall the native host and reconnect the browser: running host differs from source");
  return { hostVersion: status.version, extensionVersion: browser.version, compatibility: browser.compatibility };
}
