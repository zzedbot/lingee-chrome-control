import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { connectBridge, diagnoseBridgeInstances, listBridgeInstances } from "../src/bridge-client.mjs";

test("read-only discovery retains an unreachable runtime descriptor", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory);

    assert.deepEqual(await listBridgeInstances({ cleanupStale: false }), []);
    await fs.access(descriptorPath);
  });
});

test("ordinary discovery removes an unreachable runtime descriptor by default", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory, { pid: 99999999 });

    assert.deepEqual(await listBridgeInstances(), []);
    await assert.rejects(() => fs.access(descriptorPath), { code: "ENOENT" });
  });
});

test("ordinary discovery preserves an unreachable descriptor while its host pid is alive", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory, { pid: process.pid });

    assert.deepEqual(await listBridgeInstances(), []);
    await fs.access(descriptorPath);
  });
});

test("diagnostics report sanitized retry evidence without endpoint or token", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    await writeUnreachableDescriptor(runtimeDirectory, {
      pid: process.pid,
      endpoint: "",
      token: "must-not-leak"
    });

    const report = await diagnoseBridgeInstances();

    assert.equal(report.descriptorCount, 1);
    assert.equal(report.connectableCount, 0);
    assert.equal(report.probe.attempts, 3);
    assert.equal(report.probe.timeoutMs, 1000);
    assert.equal(report.descriptors[0].processAlive, true);
    assert.deepEqual(report.descriptors[0].probe, {
      ok: false,
      code: "MISSING_ENDPOINT",
      totalElapsedMs: 0,
      attempts: [{ attempt: 1, ok: false, code: "MISSING_ENDPOINT", elapsedMs: 0 }]
    });
    assert.doesNotMatch(JSON.stringify(report), /must-not-leak|"(?:endpoint|token)"\s*:/i);
  });
});

test("read-only connection discovery retains an unreachable runtime descriptor", async () => {
  await withRuntimeDirectory(async (runtimeDirectory) => {
    const descriptorPath = await writeUnreachableDescriptor(runtimeDirectory);

    await assert.rejects(
      () => connectBridge({ cleanupStale: false }),
      (error) => error.code === "BRIDGE_NOT_FOUND"
    );
    await fs.access(descriptorPath);
  });
});

async function withRuntimeDirectory(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-bridge-client-"));
  const previousHome = process.env.UNIVERSAL_BROWSER_BRIDGE_HOME;
  process.env.UNIVERSAL_BROWSER_BRIDGE_HOME = root;
  try {
    const runtimeDirectory = path.join(root, "runtime");
    await fs.mkdir(runtimeDirectory);
    return await run(runtimeDirectory);
  } finally {
    if (previousHome === undefined) delete process.env.UNIVERSAL_BROWSER_BRIDGE_HOME;
    else process.env.UNIVERSAL_BROWSER_BRIDGE_HOME = previousHome;
    await fs.rm(root, { recursive: true, force: true });
  }
}

async function writeUnreachableDescriptor(runtimeDirectory, overrides = {}) {
  const descriptorPath = path.join(runtimeDirectory, "bridge-1.json");
  await fs.writeFile(descriptorPath, JSON.stringify({
    instanceId: "stale",
    pid: 99999999,
    endpoint: "",
    ...overrides
  }));
  return descriptorPath;
}
