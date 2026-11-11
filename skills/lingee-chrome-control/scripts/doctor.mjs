#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveClient } from "./invoke.mjs";

const requiredMajor = 22;

export async function runDiagnostics(options = {}) {
  const env = options.env ?? process.env;
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const report = {
    ok: false,
    node: nodeCheck(nodeVersion),
    bridgeClient: undefined,
    discovery: undefined,
    instances: undefined,
    connection: undefined
  };

  let client;
  try {
    const resolved = await (options.resolveClient ?? resolveClient)({ env });
    client = resolved?.client ?? resolved;
    if (typeof client.listBridgeInstances !== "function" || typeof client.connectBridge !== "function") {
      throw Object.assign(new Error("Bridge Client exports are unavailable."), { code: "BRIDGE_CLIENT_UNAVAILABLE" });
    }
    report.bridgeClient = { ok: true, source: resolved?.source ?? "injected" };
  } catch (error) {
    report.bridgeClient = failedCheck(error);
    report.discovery = skippedCheck("bridge client unavailable");
    report.instances = skippedCheck("bridge client unavailable");
    report.connection = skippedCheck("bridge client unavailable");
    return finalize(report);
  }

  let instances;
  try {
    if (typeof client.diagnoseBridgeInstances === "function") {
      const discovery = await client.diagnoseBridgeInstances();
      instances = discovery?.instances;
      report.discovery = sanitizeDiscovery(discovery);
    } else {
      instances = await client.listBridgeInstances({ cleanupStale: false });
    }
    if (!Array.isArray(instances)) {
      throw Object.assign(new Error("Bridge Client returned invalid instances."), { code: "BRIDGE_INSTANCES_INVALID" });
    }
  } catch (error) {
    report.discovery = report.discovery ?? failedCheck(error);
    report.instances = failedCheck(error);
    report.connection = skippedCheck("bridge instances unavailable");
    return finalize(report);
  }

  if (instances.length === 0) {
    report.instances = {
      ok: false,
      count: 0,
      code: report.discovery?.descriptorCount > 0 ? "BRIDGE_PROBE_FAILED" : "BRIDGE_NOT_FOUND"
    };
    report.connection = skippedCheck("no bridge instances found");
    return finalize(report);
  }

  const selectedInstanceId = env.UNIVERSAL_BROWSER_INSTANCE_ID;
  if (!selectedInstanceId && instances.length > 1) {
    report.instances = {
      ok: false,
      count: instances.length,
      code: "BRIDGE_INSTANCE_SELECTION_REQUIRED"
    };
    report.connection = skippedCheck("multiple bridge instances require explicit selection");
    return finalize(report);
  }
  const instance = selectedInstanceId
    ? instances.find((item) => item?.instanceId === selectedInstanceId)
    : instances[0];
  report.instances = {
    ok: true,
    count: instances.length,
    selectedInstanceId: instance?.instanceId ?? selectedInstanceId
  };

  if (!instance) {
    report.instances.ok = false;
    report.connection = skippedCheck("selected bridge instance unavailable");
    return finalize(report);
  }

  try {
    const bridge = await client.connectBridge({ instanceId: instance.instanceId, cleanupStale: false });
    const status = await bridge.call("bridge.getInfo", {});
    const extensionConnected = status?.extensionConnected === true;
    report.connection = {
      ok: extensionConnected,
      instanceId: instance.instanceId,
      extensionConnected
    };
  } catch (error) {
    report.connection = failedCheck(error, { instanceId: instance.instanceId });
  }

  return finalize(report);
}

function nodeCheck(version) {
  const major = Number.parseInt(String(version).split(".", 1)[0], 10);
  return { ok: Number.isInteger(major) && major >= requiredMajor, version, requiredMajor };
}

function failedCheck(error, details = {}) {
  return {
    ok: false,
    ...details,
    ...(error?.code === undefined ? {} : { code: error.code })
  };
}

function skippedCheck(reason) {
  return { ok: false, skipped: true, reason };
}

function sanitizeDiscovery(discovery) {
  const descriptors = Array.isArray(discovery?.descriptors)
    ? discovery.descriptors.map((descriptor) => ({
      ...(typeof descriptor?.file === "string" ? { file: path.basename(descriptor.file) } : {}),
      ...(typeof descriptor?.instanceId === "string" ? { instanceId: descriptor.instanceId } : {}),
      ...(Number.isFinite(descriptor?.pid) ? { pid: descriptor.pid } : {}),
      processAlive: descriptor?.processAlive === true
        ? true
        : descriptor?.processAlive === false
          ? false
          : null,
      probe: sanitizeProbe(descriptor?.probe)
    }))
    : [];
  return {
    ok: Number(discovery?.descriptorCount) > 0 && Number(discovery?.connectableCount) > 0,
    ...(typeof discovery?.runtimeDirectory === "string" ? { runtimeDirectory: discovery.runtimeDirectory } : {}),
    descriptorCount: nonNegativeNumber(discovery?.descriptorCount),
    connectableCount: nonNegativeNumber(discovery?.connectableCount),
    probe: {
      attempts: nonNegativeNumber(discovery?.probe?.attempts),
      timeoutMs: nonNegativeNumber(discovery?.probe?.timeoutMs),
      retryDelayMs: nonNegativeNumber(discovery?.probe?.retryDelayMs)
    },
    descriptors
  };
}

function sanitizeProbe(probe) {
  return {
    ok: probe?.ok === true,
    ...(typeof probe?.code === "string" ? { code: sanitizeCode(probe.code) } : {}),
    totalElapsedMs: nonNegativeNumber(probe?.totalElapsedMs),
    attempts: Array.isArray(probe?.attempts)
      ? probe.attempts.map((attempt) => ({
        attempt: nonNegativeNumber(attempt?.attempt),
        ok: attempt?.ok === true,
        ...(typeof attempt?.code === "string" ? { code: sanitizeCode(attempt.code) } : {}),
        elapsedMs: nonNegativeNumber(attempt?.elapsedMs)
      }))
      : []
  };
}

function sanitizeCode(value) {
  const code = String(value || "UNKNOWN").toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : "UNKNOWN";
}

function nonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function finalize(report) {
  report.ok = report.node.ok
    && report.bridgeClient.ok
    && report.instances.ok
    && report.connection.ok;
  return report;
}

async function main() {
  const report = await runDiagnostics();
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
