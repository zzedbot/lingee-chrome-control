#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectBridge, listBridgeInstances } from "./runtime/bridge-client.mjs";

const REQUIRED_COMPATIBILITY = Object.freeze({
  foreignFrameMonitor: "remove-after-blank-v11",
  debuggerState: "generation-v4",
  monitorDiagnostics: "counts-v2",
  virtualCursor: "overlay-v13",
  pointerInput: "bounded-pointer-v3",
  dialogHandling: "codex-lifecycle-v3",
  locatorQueries: "codex-read-v1",
  frameLocators: "isolated-world-v1",
  navigationWaits: "navigation-v1",
  highLevelLifecycle: "codex-lifecycle-v1"
});

const REQUIRED_CAPABILITIES = Object.freeze([
  "tabs", "tabGroups", "navigation", "domSnapshot", "locatorQueries", "frameLocators",
  "elementWaits", "navigationWaits", "formControls", "sessionLeases", "tabLifecycle",
  "downloadLifecycle", "fileChooserLifecycle", "consoleLogs", "accessibility",
  "playwrightStyleLocators", "screenshots", "coordinateInput", "virtualCursor", "drag",
  "input", "fileUpload", "javascriptDialogs", "downloads", "history", "bookmarks", "cdp", "events"
]);

export async function runPreflight({ env = process.env } = {}) {
  const manifest = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, "../assets/chrome-extension/manifest.json"), "utf8"));
  const instances = await listBridgeInstances({ cleanupStale: false });
  const selectedId = env.UNIVERSAL_BROWSER_INSTANCE_ID;
  if (!instances.length) return failed("BRIDGE_NOT_FOUND", { instanceCount: 0, expectedVersion: manifest.version });
  if (!selectedId && instances.length > 1) {
    return failed("BRIDGE_INSTANCE_SELECTION_REQUIRED", {
      instanceCount: instances.length,
      instances: instances.map(({ instanceId, pid, startedAt }) => ({ instanceId, pid, startedAt })),
      expectedVersion: manifest.version
    });
  }
  const selected = selectedId ? instances.find(({ instanceId }) => instanceId === selectedId) : instances[0];
  if (!selected) return failed("BRIDGE_INSTANCE_NOT_FOUND", { instanceCount: instances.length, expectedVersion: manifest.version });

  const bridge = await connectBridge({
    instanceId: selected.instanceId,
    cleanupStale: false,
    sessionId: env.UNIVERSAL_BROWSER_SESSION_ID || `preflight-${crypto.randomUUID()}`
  });
  const [bridgeInfo, browserInfo, policy] = await Promise.all([
    bridge.call("bridge.getInfo", {}),
    bridge.call("browser.getInfo", {}),
    bridge.call("policy.get", {})
  ]);
  const missingCapabilities = REQUIRED_CAPABILITIES.filter((name) => !browserInfo?.capabilities?.includes(name));
  const compatibilityMismatches = Object.entries(REQUIRED_COMPATIBILITY)
    .filter(([name, value]) => browserInfo?.compatibility?.[name] !== value)
    .map(([name, expected]) => ({ name, expected, actual: browserInfo?.compatibility?.[name] ?? null }));
  const versionMatches = bridgeInfo?.version === manifest.version && browserInfo?.version === manifest.version;
  const extensionConnected = bridgeInfo?.extensionConnected === true;
  const ok = versionMatches && extensionConnected && !missingCapabilities.length && !compatibilityMismatches.length;

  return {
    ok,
    ...(ok ? {} : { code: "PREFLIGHT_MISMATCH" }),
    instance: { instanceId: selected.instanceId, pid: selected.pid, startedAt: selected.startedAt },
    versions: { expected: manifest.version, host: bridgeInfo?.version ?? null, extension: browserInfo?.version ?? null, matches: versionMatches },
    extensionConnected,
    compatibility: { ok: !compatibilityMismatches.length, mismatches: compatibilityMismatches },
    capabilities: { ok: !missingCapabilities.length, count: browserInfo?.capabilities?.length ?? 0, missing: missingCapabilities },
    policy: sanitizePolicy(policy)
  };
}

function sanitizePolicy(policy) {
  return {
    allowAll: policy?.allowAll === true,
    sensitiveMetadata: policy?.allowSensitiveMetadata === true,
    allowedHostCount: Array.isArray(policy?.allowedHosts) ? policy.allowedHosts.length : 0,
    blockedHostCount: Array.isArray(policy?.blockedHosts) ? policy.blockedHosts.length : 0,
    cdpAllowlistCount: Array.isArray(policy?.allowedCdpMethods) ? policy.allowedCdpMethods.length : 0
  };
}

function failed(code, details) {
  return { ok: false, code, ...details };
}

async function main() {
  try {
    const report = await runPreflight();
    process.stdout.write(`${JSON.stringify(report)}\n`);
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify(failed(error?.code || "PREFLIGHT_FAILED", {}))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
