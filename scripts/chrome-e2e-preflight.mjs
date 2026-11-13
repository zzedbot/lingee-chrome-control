import assert from "node:assert/strict";
import manifest from "../extension/manifest.json" with { type: "json" };
import { VERSION } from "../src/version.mjs";

export async function verifyChromeRuntime(bridge) {
  const status = await bridge.call("bridge.getInfo");
  assert.equal(status.extensionConnected, true, "Chrome extension is not connected");
  const browser = await bridge.call("browser.getInfo");
  assert.equal(browser.version, manifest.version, "Reload Chrome: running extension differs from source");
  assert.equal(browser.compatibility?.foreignFrameMonitor, "remove-after-blank-v11", "Reload Chrome: foreign-frame monitor code is stale");
  assert.equal(browser.compatibility?.debuggerState, "generation-v4", "Reload Chrome: debugger controller code is stale");
  assert.equal(browser.compatibility?.virtualCursor, "overlay-v13", "Reload Chrome: virtual cursor code is stale");
  assert.equal(browser.compatibility?.locatorQueries, "codex-read-v1", "Reload Chrome: typed locator query code is stale");
  assert.equal(browser.compatibility?.frameLocators, "isolated-world-v1", "Reload Chrome: frame locator code is stale");
  assert.equal(browser.compatibility?.navigationWaits, "navigation-v1", "Reload Chrome: navigation wait code is stale");
  assert.equal(browser.compatibility?.highLevelLifecycle, "codex-lifecycle-v1", "Reload Chrome: high-level lifecycle code is stale");
  assert.ok(browser.capabilities?.includes("virtualCursor"), "Reload Chrome: virtual cursor capability is missing");
  assert.ok(browser.capabilities?.includes("locatorQueries"), "Reload Chrome: typed locator query capability is missing");
  assert.ok(browser.capabilities?.includes("frameLocators"), "Reload Chrome: frame locator capability is missing");
  assert.ok(browser.capabilities?.includes("elementWaits"), "Reload Chrome: element wait capability is missing");
  assert.ok(browser.capabilities?.includes("navigationWaits"), "Reload Chrome: navigation wait capability is missing");
  for (const capability of ["formControls", "sessionLeases", "tabLifecycle", "downloadLifecycle", "fileChooserLifecycle", "consoleLogs"]) {
    assert.ok(browser.capabilities?.includes(capability), `Reload Chrome: ${capability} capability is missing`);
  }
  assert.equal(status.version, VERSION, "Reinstall the native host and reconnect Chrome: running host differs from source");
  return { hostVersion: status.version, extensionVersion: browser.version, compatibility: browser.compatibility };
}
