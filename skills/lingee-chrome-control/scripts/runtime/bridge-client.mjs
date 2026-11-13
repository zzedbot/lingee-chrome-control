import fs from "node:fs/promises";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { runtimeDirectory } from "./runtime-paths.mjs";

const DEFAULT_PROBE_ATTEMPTS = 3;
const DEFAULT_PROBE_TIMEOUT_MS = 1000;
const DEFAULT_PROBE_RETRY_DELAY_MS = 100;

export async function listBridgeInstances(options = {}) {
  const discovery = await discoverBridgeDescriptors(options);
  return discovery.instances.map(toPublicBridgeInstance);
}

export async function diagnoseBridgeInstances(options = {}) {
  const discovery = await discoverBridgeDescriptors({
    ...options,
    cleanupStale: false,
    collectDiagnostics: true
  });
  return {
    runtimeDirectory: runtimeDirectory(),
    descriptorCount: discovery.descriptorCount,
    connectableCount: discovery.instances.length,
    probe: discovery.probe,
    instances: discovery.instances.map(toPublicBridgeInstance),
    descriptors: discovery.diagnostics
  };
}

export function toPublicBridgeInstance(descriptor) {
  const instance = {};
  for (const [field, type] of [
    ["instanceId", "string"],
    ["pid", "number"],
    ["transport", "string"],
    ["nativeHostName", "string"],
    ["startedAt", "string"]
  ]) {
    const value = descriptor?.[field];
    if (typeof value === type && (type !== "number" || Number.isFinite(value))) instance[field] = value;
  }
  return instance;
}

async function discoverBridgeDescriptors({
  cleanupStale = true,
  collectDiagnostics = false,
  probeAttempts = DEFAULT_PROBE_ATTEMPTS,
  probeTimeoutMs = DEFAULT_PROBE_TIMEOUT_MS,
  probeRetryDelayMs = DEFAULT_PROBE_RETRY_DELAY_MS
} = {}) {
  const probe = {
    attempts: positiveInteger(probeAttempts, DEFAULT_PROBE_ATTEMPTS),
    timeoutMs: positiveInteger(probeTimeoutMs, DEFAULT_PROBE_TIMEOUT_MS),
    retryDelayMs: nonNegativeInteger(probeRetryDelayMs, DEFAULT_PROBE_RETRY_DELAY_MS)
  };
  let names;
  try { names = await fs.readdir(runtimeDirectory()); } catch (error) {
    if (error.code === "ENOENT") {
      return { instances: [], descriptorCount: 0, diagnostics: [], probe };
    }
    throw error;
  }
  const instances = [];
  const diagnostics = [];
  const descriptorNames = names.filter((entry) => /^bridge-\d+\.json$/.test(entry));
  for (const name of descriptorNames) {
    const file = path.join(runtimeDirectory(), name);
    let descriptor;
    try {
      descriptor = JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (collectDiagnostics) diagnostics.push({
        file: name,
        processAlive: null,
        probe: failedProbe("DESCRIPTOR_INVALID", 0)
      });
      continue;
    }

    const probeResult = await probeDescriptor(descriptor, probe);
    const processAlive = isProcessAlive(descriptor?.pid);
    if (probeResult.ok) instances.push(descriptor);
    else if (cleanupStale && processAlive === false) await fs.rm(file, { force: true }).catch(() => {});

    if (collectDiagnostics) diagnostics.push({
      file: name,
      ...toPublicBridgeInstance(descriptor),
      processAlive,
      probe: probeResult
    });
  }
  return {
    instances: instances.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))),
    descriptorCount: descriptorNames.length,
    diagnostics,
    probe
  };
}

export async function connectBridge({ instanceId, timeoutMs = 3000, cleanupStale = true, sessionId } = {}) {
  const { instances } = await discoverBridgeDescriptors({ cleanupStale });
  const descriptor = instanceId ? instances.find((item) => item.instanceId === instanceId) : instances[0];
  if (!descriptor) throw Object.assign(new Error("No running Lingee Chrome Agent Bridge instance was found. Open Chrome and enable the extension."), { code: "BRIDGE_NOT_FOUND" });
  return new BridgeClient(descriptor, timeoutMs, sessionId);
}

export class BridgeClient {
  constructor(descriptor, timeoutMs = 30000, sessionId = process.env.UNIVERSAL_BROWSER_SESSION_ID || crypto.randomUUID()) {
    this.descriptor = descriptor;
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.sessionId = sessionId;
  }

  call(method, params = {}, { timeoutMs = this.timeoutMs } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const socket = net.createConnection(this.descriptor.endpoint);
      let buffer = "";
      const timer = setTimeout(() => socket.destroy(Object.assign(new Error(`${method} timed out`), { code: "BRIDGE_TIMEOUT" })), timeoutMs);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params, auth: this.descriptor.token, sessionId: this.sessionId })}\n`));
      socket.on("data", (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf("\n");
        if (newline < 0) return;
        clearTimeout(timer);
        socket.end();
        try {
          const response = JSON.parse(buffer.slice(0, newline));
          if (response.error) reject(Object.assign(new Error(response.error.message), response.error.data || {}, { rpcCode: response.error.code }));
          else resolve(response.result);
        } catch (error) { reject(error); }
      });
      socket.on("error", (error) => { clearTimeout(timer); reject(error); });
    });
  }
}

async function probeDescriptor(descriptor, options) {
  const attempts = [];
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    const result = await probeEndpoint(descriptor?.endpoint, options.timeoutMs);
    attempts.push({ attempt, ...result });
    if (result.ok) {
      return {
        ok: true,
        totalElapsedMs: attempts.reduce((sum, item) => sum + item.elapsedMs, 0),
        attempts
      };
    }
    if (result.code === "MISSING_ENDPOINT") break;
    if (attempt < options.attempts && options.retryDelayMs > 0) await delay(options.retryDelayMs);
  }
  return {
    ok: false,
    code: attempts.at(-1)?.code || "PIPE_PROBE_FAILED",
    totalElapsedMs: attempts.reduce((sum, item) => sum + item.elapsedMs, 0),
    attempts
  };
}

function probeEndpoint(endpoint, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const validEndpoint = (typeof endpoint === "string" && endpoint.length > 0)
      || (endpoint !== null && typeof endpoint === "object" && !Array.isArray(endpoint));
    if (!validEndpoint) {
      resolve({ ok: false, code: "MISSING_ENDPOINT", elapsedMs: 0 });
      return;
    }
    const socket = net.createConnection(endpoint);
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, elapsedMs: Date.now() - startedAt });
    };
    const timer = setTimeout(() => {
      socket.destroy();
      finish({ ok: false, code: "PIPE_PROBE_TIMEOUT" });
    }, timeoutMs);
    socket.once("connect", () => {
      socket.end();
      finish({ ok: true });
    });
    socket.once("error", (error) => finish({
      ok: false,
      code: sanitizedErrorCode(error?.code)
    }));
  });
}

function failedProbe(code, elapsedMs) {
  return {
    ok: false,
    code,
    totalElapsedMs: elapsedMs,
    attempts: [{ attempt: 1, ok: false, code, elapsedMs }]
  };
}

function sanitizedErrorCode(value) {
  const code = String(value || "PIPE_PROBE_ERROR").toUpperCase();
  return /^[A-Z0-9_]{1,64}$/.test(code) ? code : "PIPE_PROBE_ERROR";
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    return null;
  }
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeInteger(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
