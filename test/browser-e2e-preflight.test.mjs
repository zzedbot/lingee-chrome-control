import test from "node:test";
import assert from "node:assert/strict";
import { verifyBrowserRuntime } from "../scripts/browser-e2e-preflight.mjs";
import { VERSION } from "../src/version.mjs";

const compatibility = { foreignFrameMonitor: "remove-after-blank-v11", debuggerState: "generation-v4", virtualCursor: "overlay-v13", locatorQueries: "codex-read-v3", formControls: "verified-fill-v3", frameLocators: "isolated-world-v1", navigationWaits: "navigation-v1", transientFeedback: "feedback-v1", highLevelLifecycle: "codex-lifecycle-v1", sessionClipboard: "host-memory-v1", viewportEmulation: "viewport-v1", observedResourceExport: "resource-export-v1", actionIntents: "action-intent-v3", observationFreshness: "observation-v1" };
const capabilities = ["virtualCursor", "locatorQueries", "locatorDescriptors", "frameLocators", "elementWaits", "navigationWaits", "transientFeedback", "formControls", "sessionLeases", "sessionClipboard", "viewportEmulation", "observedResourceExport", "actionIntents", "observationFreshness", "tabLifecycle", "downloadLifecycle", "fileChooserLifecycle", "consoleLogs"];
function fixture(browser, connected = true, hostVersion = VERSION) {
  const calls = [];
  return {
    calls,
    async call(method) {
      calls.push(method);
      if (method === "bridge.getInfo") return { extensionConnected: connected, version: hostVersion };
      if (method === "browser.getInfo") return browser;
      throw new Error(`Unexpected browser mutation: ${method}`);
    }
  };
}

test("E2E preflight rejects old code before opening a test tab", async () => {
  for (const browser of [
    { version: "0.1.1", compatibility, capabilities },
    { version: VERSION, capabilities },
    { version: VERSION, compatibility: { ...compatibility, debuggerState: "old" }, capabilities }
  ]) {
    const bridge = fixture(browser);
    await assert.rejects(verifyBrowserRuntime(bridge), /Reload the browser extension/);
    assert.deepEqual(bridge.calls, ["bridge.getInfo", "browser.getInfo"]);
  }
});

test("E2E preflight stops at a disconnected extension", async () => {
  const bridge = fixture({}, false);
  await assert.rejects(verifyBrowserRuntime(bridge), /not connected/);
  assert.deepEqual(bridge.calls, ["bridge.getInfo"]);
});

test("E2E preflight returns running version evidence", async () => {
  const bridge = fixture({ version: VERSION, compatibility, capabilities });
  assert.deepEqual(await verifyBrowserRuntime(bridge), {
    hostVersion: VERSION, extensionVersion: VERSION, compatibility
  });
});

test("E2E preflight rejects a stale installed native host", async () => {
  const bridge = fixture({ version: VERSION, compatibility, capabilities }, true, "0.1.0");
  await assert.rejects(verifyBrowserRuntime(bridge), /Reinstall the native host/);
});
