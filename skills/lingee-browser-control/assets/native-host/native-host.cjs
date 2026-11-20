#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// src/native-host.mjs
var import_node_crypto3 = __toESM(require("node:crypto"), 1);
var import_promises3 = __toESM(require("node:fs/promises"), 1);
var import_node_net = __toESM(require("node:net"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);
var import_node_process = __toESM(require("node:process"), 1);

// src/native-framing.mjs
var NativeMessageDecoder = class {
  constructor({ maxBytes = 64 * 1024 * 1024 } = {}) {
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
  }
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (length > this.maxBytes) throw new Error(`Native message exceeds ${this.maxBytes} bytes`);
      if (this.buffer.length < length + 4) break;
      const payload = this.buffer.subarray(4, length + 4).toString("utf8");
      this.buffer = this.buffer.subarray(length + 4);
      messages.push(JSON.parse(payload));
    }
    return messages;
  }
};
function encodeNativeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

// src/policy.mjs
var import_promises = __toESM(require("node:fs/promises"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);

// src/runtime-paths.mjs
var import_node_os = __toESM(require("node:os"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var HOST_NAME = "com.lingee.app.browser_agent_bridge";
function dataDirectory() {
  if (process.env.LINGEE_BROWSER_BRIDGE_HOME) return import_node_path.default.resolve(process.env.LINGEE_BROWSER_BRIDGE_HOME);
  if (process.platform === "win32") return import_node_path.default.join(process.env.LOCALAPPDATA || import_node_path.default.join(import_node_os.default.homedir(), "AppData", "Local"), "Lingee", "BrowserAgentBridge");
  if (process.platform === "darwin") return import_node_path.default.join(import_node_os.default.homedir(), "Library", "Application Support", "Lingee", "BrowserAgentBridge");
  return import_node_path.default.join(process.env.XDG_STATE_HOME || import_node_path.default.join(import_node_os.default.homedir(), ".local", "state"), "lingee", "browser-agent-bridge");
}
function runtimeDirectory() {
  return import_node_path.default.join(dataDirectory(), "runtime");
}
function policyPath() {
  return import_node_path.default.join(dataDirectory(), "policy.json");
}
function resourceExportDirectory() {
  return import_node_path.default.join(dataDirectory(), "resource-exports");
}

// src/policy.mjs
var DEFAULT_POLICY = Object.freeze({
  allowAll: false,
  allowSensitiveMetadata: false,
  allowSessionClipboardRead: false,
  allowSessionClipboardWrite: false,
  allowedHosts: ["localhost", "127.0.0.1", "::1"],
  blockedHosts: [],
  allowedCdpMethods: [
    "Accessibility.getFullAXTree",
    "DOM.getDocument",
    "DOM.querySelector",
    "DOM.resolveNode",
    "DOM.setFileInputFiles",
    "Network.getResponseBody",
    "Page.captureScreenshot",
    "Page.getLayoutMetrics",
    "Runtime.callFunctionOn",
    "Runtime.evaluate"
  ]
});
async function loadPolicy() {
  try {
    const parsed = JSON.parse(await import_promises.default.readFile(policyPath(), "utf8"));
    return normalizePolicy(parsed);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return structuredClone(DEFAULT_POLICY);
  }
}
async function savePolicy(policy) {
  const normalized = normalizePolicy(policy);
  await import_promises.default.mkdir(import_node_path2.default.dirname(policyPath()), { recursive: true });
  await import_promises.default.writeFile(policyPath(), `${JSON.stringify(normalized, null, 2)}
`, { encoding: "utf8", mode: 384 });
  return normalized;
}
function normalizeHost(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) throw new Error("Host is required");
  if (raw.includes("://")) return new URL(raw).hostname.toLowerCase();
  return raw.replace(/^\[|\]$/g, "").replace(/\.$/, "");
}
function isHostAllowed(policy, value) {
  const host = normalizeHost(value);
  if (matchesHostList(host, policy.blockedHosts)) return false;
  return policy.allowAll || matchesHostList(host, policy.allowedHosts);
}
function assertUrlAllowed(policy, value) {
  const url = new URL(value);
  if (url.protocol === "about:" && url.href === "about:blank") return;
  if (!["http:", "https:"].includes(url.protocol)) {
    throw Object.assign(new Error(`Unsupported URL protocol: ${url.protocol}`), { code: "UNSUPPORTED_PROTOCOL" });
  }
  if (!isHostAllowed(policy, url.hostname)) {
    throw Object.assign(new Error(`Site approval required for ${url.hostname}`), {
      code: "SITE_APPROVAL_REQUIRED",
      data: { host: url.hostname }
    });
  }
}
function assertCdpAllowed(policy, method) {
  if (!policy.allowedCdpMethods.includes(method)) {
    throw Object.assign(new Error(`CDP method is not allowed: ${method}`), { code: "CDP_METHOD_BLOCKED" });
  }
}
function normalizePolicy(policy = {}) {
  return {
    allowAll: policy.allowAll === true,
    allowSensitiveMetadata: policy.allowSensitiveMetadata === true,
    allowSessionClipboardRead: policy.allowSessionClipboardRead === true,
    allowSessionClipboardWrite: policy.allowSessionClipboardWrite === true,
    allowedHosts: uniqueHosts(policy.allowedHosts ?? DEFAULT_POLICY.allowedHosts),
    blockedHosts: uniqueHosts(policy.blockedHosts ?? []),
    allowedCdpMethods: [...new Set((policy.allowedCdpMethods ?? DEFAULT_POLICY.allowedCdpMethods).map(String))].sort()
  };
}
function uniqueHosts(values) {
  return [...new Set(values.map(normalizeHost))].sort();
}
function matchesHostList(host, values) {
  return values.some((entry) => host === entry || host.endsWith(`.${entry}`));
}

// package.json
var package_default = {
  name: "lingee-browser-agent-bridge",
  version: "0.2.2",
  description: "Clean-room browser control bridge for MCP and JSON-RPC agents.",
  type: "module",
  license: "MIT",
  private: true,
  bin: {
    "lingee-browser-mcp": "./src/mcp-server.mjs",
    "lingee-browser-rpc": "./src/jsonrpc-cli.mjs"
  },
  scripts: {
    test: 'node --test "test/*.test.mjs"',
    "test:web:build": "npm --prefix test/web-fixture run build",
    "test:web:browser": "npm --prefix test/web-fixture run build && node scripts/web-fixture-e2e.mjs",
    "test:browser:kdesign": "npm --prefix test/web-fixture run build && node scripts/kdesign-e2e.mjs",
    "test:browser": "node scripts/browser-e2e.mjs",
    "test:browser:foreign-frame": "node scripts/browser-e2e.mjs --require-foreign-frame",
    check: "node --check src/native-host.mjs && node --check src/action-intents.mjs && node --check src/session-manager.mjs && node --check src/session-clipboard.mjs && node --check src/resource-export.mjs && node --check src/bridge-client.mjs && node --check src/mcp-server.mjs && node --check src/jsonrpc-cli.mjs && node --check skills/lingee-browser-control/scripts/runtime/standard-capabilities.mjs && node --check skills/lingee-browser-control/scripts/invoke.mjs && node --check skills/lingee-browser-control/scripts/run-workflow.mjs && node --check skills/lingee-browser-control/scripts/doctor.mjs && node --check skills/lingee-browser-control/scripts/preflight.mjs && node --check skills/lingee-browser-control/scripts/install-host.mjs && node --check skills/lingee-browser-control/scripts/uninstall-host.mjs && node --check extension/background.js && node --check extension/feedback-monitor.js && node --check extension/observation-state.js && node --check extension/observation-evidence.js && node --check extension/resource-catalog.js && node --check extension/form-controls.js && node --check extension/locator-query.js && node --check extension/frame-locator.js && node --check extension/debugger-controller.js && node --check extension/foreign-frame-monitor.js && node --check extension/virtual-cursor.js && node --check extension/viewport.js && node --check extension/tab-operation-queue.js && node --check scripts/browser-e2e.mjs && node --check scripts/web-fixture-e2e.mjs && node --check scripts/kdesign-e2e.mjs && node --check extension/monitor-injection.js && node --check scripts/browser-e2e-preflight.mjs && node --check scripts/build-native-host.mjs && node --check scripts/install-host.mjs",
    "build:host": "node scripts/build-native-host.mjs",
    "install:host": "node scripts/install-host.mjs",
    "uninstall:host": "node scripts/uninstall-host.mjs"
  },
  devDependencies: {
    esbuild: "^0.25.0"
  },
  engines: {
    node: ">=22.0.0"
  }
};

// src/version.mjs
var VERSION = package_default.version;

// src/session-manager.mjs
var DEFAULT_LEASE_MS = 30 * 60 * 1e3;
function createSessionManager({ leaseMs = DEFAULT_LEASE_MS, now = () => Date.now() } = {}) {
  const tabs = /* @__PURE__ */ new Map();
  const sessions = /* @__PURE__ */ new Map();
  function requireSessionId3(value) {
    const id = String(value || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
    return id;
  }
  function touch(sessionId) {
    const id = requireSessionId3(sessionId);
    sessions.set(id, { lastSeenAt: now() });
    for (const lease of tabs.values()) if (lease.sessionId === id) lease.expiresAt = now() + leaseMs;
    return id;
  }
  function acquire(tabId, sessionId, { temporary = false } = {}) {
    const id = touch(sessionId);
    const current = activeLease(tabId);
    if (current && current.sessionId !== id) throw coded("TAB_OWNED_BY_ANOTHER_SESSION", `Tab ${tabId} is owned by another session`, { tabId, expiresAt: current.expiresAt });
    const lease = current || { tabId, sessionId: id, temporary, marker: null, createdAt: now() };
    lease.sessionId = id;
    lease.temporary ||= temporary;
    lease.expiresAt = now() + leaseMs;
    tabs.set(tabId, lease);
    return publicLease(lease);
  }
  function assertOwner(tabId, sessionId) {
    const id = touch(sessionId);
    const lease = activeLease(tabId);
    if (!lease) throw coded("TAB_NOT_CLAIMED", `Tab ${tabId} must be claimed before mutation`, { tabId });
    if (lease.sessionId !== id) throw coded("TAB_OWNED_BY_ANOTHER_SESSION", `Tab ${tabId} is owned by another session`, { tabId, expiresAt: lease.expiresAt });
    lease.expiresAt = now() + leaseMs;
    return publicLease(lease);
  }
  function mark(tabId, sessionId, marker) {
    if (!["handoff", "deliverable"].includes(marker)) throw coded("INVALID_PARAMS", "marker must be handoff or deliverable");
    assertOwner(tabId, sessionId);
    const lease = tabs.get(tabId);
    lease.marker = marker;
    return publicLease(lease);
  }
  function transfer(tabId, sessionId, targetSessionId) {
    assertOwner(tabId, sessionId);
    const target = requireSessionId3(targetSessionId);
    const lease = tabs.get(tabId);
    lease.sessionId = target;
    lease.expiresAt = now() + leaseMs;
    sessions.set(target, { lastSeenAt: now() });
    return publicLease(lease);
  }
  function forgetTab(tabId) {
    tabs.delete(tabId);
  }
  function releaseSession(sessionId) {
    const id = requireSessionId3(sessionId);
    const leases = [...tabs.values()].filter((lease) => lease.sessionId === id).map(publicLease);
    for (const lease of leases) tabs.delete(lease.tabId);
    sessions.delete(id);
    return leases;
  }
  function expiredSessions() {
    const threshold = now() - leaseMs;
    return [...sessions.entries()].filter(([, value]) => value.lastSeenAt <= threshold).map(([id]) => id);
  }
  function activeLease(tabId) {
    const lease = tabs.get(tabId);
    if (lease && lease.expiresAt <= now()) {
      tabs.delete(tabId);
      return null;
    }
    return lease || null;
  }
  return { acquire, assertOwner, mark, transfer, forgetTab, releaseSession, expiredSessions, touch, get: (tabId) => activeLease(tabId) ? publicLease(activeLease(tabId)) : null };
}
function publicLease(lease) {
  return { tabId: lease.tabId, sessionId: lease.sessionId, temporary: lease.temporary, marker: lease.marker, createdAt: lease.createdAt, expiresAt: lease.expiresAt };
}
function coded(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

// src/session-clipboard.mjs
var SESSION_CLIPBOARD_MIME_TYPES = Object.freeze([
  "text/plain",
  "text/markdown",
  "text/html",
  "image/png"
]);
var SESSION_CLIPBOARD_LIMITS = Object.freeze({
  maxItems: 4,
  maxItemBytes: 256 * 1024,
  maxTotalBytes: 256 * 1024
});
var allowedMimeTypes = new Set(SESSION_CLIPBOARD_MIME_TYPES);
var pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function createSessionClipboard({ now = () => Date.now() } = {}) {
  const sessions = /* @__PURE__ */ new Map();
  function write(sessionId, rawItems) {
    const id = requireSessionId(sessionId);
    const items = normalizeItems(rawItems);
    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
    const updatedAt = now();
    sessions.set(id, { items, totalBytes, updatedAt });
    return metadata(items, totalBytes, updatedAt);
  }
  function read(sessionId, rawMimeTypes) {
    const id = requireSessionId(sessionId);
    const mimeTypes = normalizeMimeFilter(rawMimeTypes);
    const entry = sessions.get(id);
    if (!entry) return { items: [], itemCount: 0, totalBytes: 0, updatedAt: null };
    const items = entry.items.filter(({ mimeType }) => !mimeTypes || mimeTypes.has(mimeType)).map(({ sizeBytes, ...item }) => ({ ...item, sizeBytes }));
    return {
      items,
      itemCount: items.length,
      totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
      updatedAt: entry.updatedAt
    };
  }
  function clear(sessionId) {
    const id = requireSessionId(sessionId);
    const entry = sessions.get(id);
    sessions.delete(id);
    return {
      cleared: entry != null,
      itemCount: entry?.items.length ?? 0,
      totalBytes: entry?.totalBytes ?? 0
    };
  }
  return { write, read, clear, releaseSession: clear };
}
function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > SESSION_CLIPBOARD_LIMITS.maxItems) {
    throw coded2("CLIPBOARD_ITEMS_INVALID", `items must contain 1 to ${SESSION_CLIPBOARD_LIMITS.maxItems} entries`);
  }
  const seen = /* @__PURE__ */ new Set();
  const items = rawItems.map((rawItem, index) => normalizeItem(rawItem, index, seen));
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalBytes > SESSION_CLIPBOARD_LIMITS.maxTotalBytes) {
    throw coded2("CLIPBOARD_TOO_LARGE", `Session clipboard exceeds ${SESSION_CLIPBOARD_LIMITS.maxTotalBytes} bytes`, { maxBytes: SESSION_CLIPBOARD_LIMITS.maxTotalBytes });
  }
  return items;
}
function normalizeItem(rawItem, index, seen) {
  if (!isPlainObject(rawItem)) throw coded2("CLIPBOARD_ITEM_INVALID", `items[${index}] must be an object`);
  const unknown = Object.keys(rawItem).find((key) => !["mimeType", "data", "encoding"].includes(key));
  if (unknown) throw coded2("CLIPBOARD_ITEM_INVALID", `Unknown clipboard item field: ${unknown}`, { field: unknown, index });
  const mimeType = String(rawItem.mimeType || "").trim().toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) throw coded2("CLIPBOARD_MIME_NOT_ALLOWED", `Clipboard MIME type is not allowed: ${mimeType || "(empty)"}`, { mimeType });
  if (seen.has(mimeType)) throw coded2("CLIPBOARD_ITEM_INVALID", `Duplicate clipboard MIME type: ${mimeType}`, { mimeType });
  seen.add(mimeType);
  if (typeof rawItem.data !== "string") throw coded2("CLIPBOARD_ITEM_INVALID", `Clipboard ${mimeType} data must be a string`, { mimeType });
  if (mimeType === "image/png") {
    if (rawItem.encoding !== "base64") throw coded2("CLIPBOARD_ENCODING_INVALID", "image/png requires base64 encoding");
    const bytes = decodeCanonicalBase64(rawItem.data);
    if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
      throw coded2("CLIPBOARD_BINARY_INVALID", "image/png data does not have a PNG signature");
    }
    assertItemSize(bytes.length);
    return { mimeType, encoding: "base64", data: rawItem.data, sizeBytes: bytes.length };
  }
  if (rawItem.encoding !== void 0 && rawItem.encoding !== "utf8") throw coded2("CLIPBOARD_ENCODING_INVALID", `${mimeType} requires utf8 encoding`);
  const sizeBytes = Buffer.byteLength(rawItem.data, "utf8");
  assertItemSize(sizeBytes);
  return { mimeType, encoding: "utf8", data: rawItem.data, sizeBytes };
}
function normalizeMimeFilter(rawMimeTypes) {
  if (rawMimeTypes === void 0) return null;
  if (!Array.isArray(rawMimeTypes) || rawMimeTypes.length < 1 || rawMimeTypes.length > SESSION_CLIPBOARD_LIMITS.maxItems) {
    throw coded2("CLIPBOARD_ITEMS_INVALID", `mimeTypes must contain 1 to ${SESSION_CLIPBOARD_LIMITS.maxItems} entries`);
  }
  const mimeTypes = /* @__PURE__ */ new Set();
  for (const rawMimeType of rawMimeTypes) {
    const mimeType = String(rawMimeType || "").trim().toLowerCase();
    if (!allowedMimeTypes.has(mimeType)) throw coded2("CLIPBOARD_MIME_NOT_ALLOWED", `Clipboard MIME type is not allowed: ${mimeType || "(empty)"}`, { mimeType });
    mimeTypes.add(mimeType);
  }
  return mimeTypes;
}
function decodeCanonicalBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw coded2("CLIPBOARD_BINARY_INVALID", "Binary clipboard data must use canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw coded2("CLIPBOARD_BINARY_INVALID", "Binary clipboard data must use canonical base64");
  return bytes;
}
function assertItemSize(sizeBytes) {
  if (sizeBytes > SESSION_CLIPBOARD_LIMITS.maxItemBytes) {
    throw coded2("CLIPBOARD_TOO_LARGE", `Clipboard item exceeds ${SESSION_CLIPBOARD_LIMITS.maxItemBytes} bytes`, { maxBytes: SESSION_CLIPBOARD_LIMITS.maxItemBytes });
  }
}
function metadata(items, totalBytes, updatedAt) {
  return { itemCount: items.length, totalBytes, mimeTypes: items.map(({ mimeType }) => mimeType), updatedAt };
}
function requireSessionId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded2("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
  return id;
}
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function coded2(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

// src/resource-export.mjs
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_promises2 = __toESM(require("node:fs/promises"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var RESOURCE_EXPORT_LIMITS = Object.freeze({
  maxResources: 20,
  maxResourceBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024
});
function createResourceExporter({ rootDirectory = resourceExportDirectory(), now = () => Date.now(), randomUUID = () => import_node_crypto.default.randomUUID() } = {}) {
  const artifactsBySession = /* @__PURE__ */ new Map();
  async function exportArchive(sessionId, payload) {
    const normalized = normalizePayload(payload);
    const sessionDirectory = import_node_path3.default.join(rootDirectory, sessionKey(sessionId));
    await import_promises2.default.mkdir(sessionDirectory, { recursive: true, mode: 448 });
    const fileName = `lingee-page-resources-${randomUUID()}.zip`;
    const artifactPath = import_node_path3.default.join(sessionDirectory, fileName);
    const entries = [];
    const usedNames = /* @__PURE__ */ new Set();
    let totalResourceBytes = 0;
    const manifestResources = [];
    for (const resource of normalized.resources) {
      const bytes = decodeResource(resource);
      if (bytes.length > RESOURCE_EXPORT_LIMITS.maxResourceBytes) throw coded3("RESOURCE_TOO_LARGE", "One selected resource exceeds the per-resource export limit", { maxBytes: RESOURCE_EXPORT_LIMITS.maxResourceBytes, resourceId: resource.resourceId });
      totalResourceBytes += bytes.length;
      if (totalResourceBytes > RESOURCE_EXPORT_LIMITS.maxTotalBytes) throw coded3("RESOURCE_EXPORT_TOO_LARGE", "Selected resources exceed the total export limit", { maxBytes: RESOURCE_EXPORT_LIMITS.maxTotalBytes });
      const entryName = uniqueEntryName(safeFileName(resource.suggestedFilename || fileNameFromUrl(resource.url, resource.mimeType)), usedNames);
      entries.push({ name: `resources/${entryName}`, data: bytes });
      manifestResources.push({
        resourceId: resource.resourceId,
        path: `resources/${entryName}`,
        url: resource.url,
        type: resource.type,
        mimeType: resource.mimeType,
        byteCount: bytes.length
      });
    }
    const manifest = {
      format: "lingee-observed-resources-v1",
      pageUrl: normalized.pageUrl,
      documentId: normalized.documentId,
      createdAt: new Date(now()).toISOString(),
      resourceCount: manifestResources.length,
      totalResourceBytes,
      resources: manifestResources
    };
    entries.unshift({ name: "manifest.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}
`, "utf8") });
    const archive = createZip(entries, new Date(now()));
    await import_promises2.default.writeFile(artifactPath, archive, { mode: 384, flag: "wx" });
    const artifacts = artifactsBySession.get(sessionId) || /* @__PURE__ */ new Set();
    artifacts.add(artifactPath);
    artifactsBySession.set(sessionId, artifacts);
    return {
      path: artifactPath,
      fileName,
      format: "zip",
      resourceCount: manifestResources.length,
      totalResourceBytes,
      archiveBytes: archive.length,
      lifecycle: "session-temporary"
    };
  }
  async function releaseSession(sessionId) {
    const artifacts = [...artifactsBySession.get(sessionId) || []];
    artifactsBySession.delete(sessionId);
    let removed = 0;
    for (const artifact of artifacts) {
      if (!isWithin(rootDirectory, artifact)) continue;
      try {
        await import_promises2.default.unlink(artifact);
        removed += 1;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const sessionDirectory = import_node_path3.default.join(rootDirectory, sessionKey(sessionId));
    if (isWithin(rootDirectory, sessionDirectory)) await import_promises2.default.rmdir(sessionDirectory).catch((error) => {
      if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
    });
    return { removed };
  }
  async function releaseAll() {
    let removed = 0;
    for (const sessionId of [...artifactsBySession.keys()]) removed += (await releaseSession(sessionId)).removed;
    return { removed };
  }
  return { exportArchive, releaseSession, releaseAll };
}
function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw coded3("RESOURCE_EXPORT_INVALID", "Resource export payload must be an object");
  const pageUrl = requireHttpUrl(payload.pageUrl, "pageUrl");
  const documentId = requireString(payload.documentId, "documentId", 200);
  if (!Array.isArray(payload.resources) || payload.resources.length < 1 || payload.resources.length > RESOURCE_EXPORT_LIMITS.maxResources) {
    throw coded3("RESOURCE_SELECTION_INVALID", `resources must contain 1 to ${RESOURCE_EXPORT_LIMITS.maxResources} items`);
  }
  const ids = /* @__PURE__ */ new Set();
  const resources = payload.resources.map((resource) => {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) throw coded3("RESOURCE_EXPORT_INVALID", "Each resource must be an object");
    const resourceId = requireString(resource.resourceId, "resourceId", 200);
    if (ids.has(resourceId)) throw coded3("RESOURCE_SELECTION_INVALID", "resourceIds must be unique");
    ids.add(resourceId);
    return {
      resourceId,
      url: requireHttpUrl(resource.url, "resource.url"),
      type: requireString(resource.type || "Other", "resource.type", 100),
      mimeType: requireString(resource.mimeType || "application/octet-stream", "resource.mimeType", 200),
      suggestedFilename: typeof resource.suggestedFilename === "string" ? resource.suggestedFilename : "",
      content: requireString(resource.content, "resource.content", 12 * 1024 * 1024),
      base64Encoded: resource.base64Encoded === true
    };
  });
  return { pageUrl, documentId, resources };
}
function decodeResource(resource) {
  if (!resource.base64Encoded) return Buffer.from(resource.content, "utf8");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resource.content)) throw coded3("RESOURCE_CONTENT_INVALID", "Resource content is not canonical Base64", { resourceId: resource.resourceId });
  const bytes = Buffer.from(resource.content, "base64");
  if (bytes.toString("base64") !== resource.content) throw coded3("RESOURCE_CONTENT_INVALID", "Resource content is not canonical Base64", { resourceId: resource.resourceId });
  return bytes;
}
function createZip(entries, timestamp) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = dosTimestamp(timestamp);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(67324752, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(2048, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(33639248, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(2048, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(101010256, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
function crc32(buffer) {
  let crc = 4294967295;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc >>> 1 ^ 3988292384 & -(crc & 1);
  }
  return (crc ^ 4294967295) >>> 0;
}
function dosTimestamp(value) {
  const date = value instanceof Date && !Number.isNaN(value.valueOf()) ? value : /* @__PURE__ */ new Date();
  const year = Math.max(1980, date.getFullYear());
  return {
    date: year - 1980 << 9 | date.getMonth() + 1 << 5 | date.getDate(),
    time: date.getHours() << 11 | date.getMinutes() << 5 | Math.floor(date.getSeconds() / 2)
  };
}
function fileNameFromUrl(value, mimeType) {
  const url = new URL(value);
  const base = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "resource");
  if (import_node_path3.default.extname(base)) return base;
  return `${base}${extensionForMime(mimeType)}`;
}
function extensionForMime(mimeType) {
  return { "text/css": ".css", "text/javascript": ".js", "application/javascript": ".js", "application/json": ".json", "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "text/plain": ".txt", "text/vtt": ".vtt" }[String(mimeType).toLowerCase()] || ".bin";
}
function safeFileName(value) {
  const visible = Array.from(String(value || "resource"), (character) => character.codePointAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "_" : character).join("");
  const cleaned = visible.replace(/[. ]+$/g, "").slice(0, 120);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "resource.bin";
}
function uniqueEntryName(value, used) {
  const extension = import_node_path3.default.extname(value);
  const stem = value.slice(0, Math.max(0, value.length - extension.length));
  let candidate = value;
  for (let index = 2; used.has(candidate.toLowerCase()); index += 1) candidate = `${stem}-${index}${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}
function sessionKey(sessionId) {
  return import_node_crypto.default.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 24);
}
function requireString(value, field, maxLength) {
  if (typeof value !== "string" || !value || value.length > maxLength) throw coded3("RESOURCE_EXPORT_INVALID", `${field} must be a non-empty string no longer than ${maxLength} characters`);
  return value;
}
function requireHttpUrl(value, field) {
  const raw = requireString(value, field, 4096);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw coded3("RESOURCE_URL_INVALID", `${field} must be a valid URL`);
  }
  if (!["http:", "https:"].includes(url.protocol)) throw coded3("RESOURCE_URL_INVALID", `${field} must use HTTP or HTTPS`);
  return url.href;
}
function isWithin(root, candidate) {
  const relative = import_node_path3.default.relative(import_node_path3.default.resolve(root), import_node_path3.default.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !import_node_path3.default.isAbsolute(relative);
}
function coded3(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

// src/action-intents.mjs
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var ACTION_INTENT_TYPES = Object.freeze({
  upload: "sensitive-data-transfer",
  "message-send": "irreversible-write",
  delete: "irreversible-write",
  payment: "irreversible-write",
  "permission-change": "irreversible-write",
  login: "sensitive-data-transfer",
  "browser-permission": "reversible-write",
  "record-create": "reversible-write",
  "record-update": "reversible-write",
  "record-submit": "irreversible-write"
});
var ACTION_INTENT_METHODS = Object.freeze([
  "browser.click",
  "browser.coordinateClick",
  "browser.press",
  "browser.fill",
  "browser.type",
  "browser.check",
  "browser.uncheck",
  "browser.setChecked",
  "browser.selectOption",
  "browser.setFileInput",
  "browser.setFileChooserFiles",
  "browser.handleDialog",
  "browser.performAndWaitForFeedback"
]);
var DEFAULT_TTL_MS = 5 * 60 * 1e3;
function createActionIntentManager({ now = () => Date.now(), randomUUID = () => import_node_crypto2.default.randomUUID(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const intentsBySession = /* @__PURE__ */ new Map();
  const approvalsBySession = /* @__PURE__ */ new Map();
  function prepare(sessionId, input) {
    const session = requireSessionId2(sessionId);
    const normalized = normalizeIntentInput(input);
    const scopeKey = scopeFor(normalized);
    const remembered = approvalsBySession.get(session)?.has(scopeKey) === true;
    const intent = {
      intentId: `intent-${randomUUID()}`,
      ...normalized,
      scopeKey,
      status: remembered ? "confirmed" : "pending-confirmation",
      confirmationRequired: !remembered,
      rememberedAuthorization: remembered,
      createdAt: new Date(now()).toISOString(),
      expiresAt: new Date(now() + ttlMs).toISOString()
    };
    const intents = intentsBySession.get(session) || /* @__PURE__ */ new Map();
    intents.set(intent.intentId, intent);
    intentsBySession.set(session, intents);
    return publicIntent(intent);
  }
  function confirm(sessionId, { intentId, decision, rememberForSession = false } = {}) {
    const session = requireSessionId2(sessionId);
    const intent = currentIntent(session, intentId);
    if (!["approve", "reject"].includes(decision)) throw coded4("INVALID_PARAMS", "decision must be approve or reject");
    if (intent.status !== "pending-confirmation") throw coded4("ACTION_INTENT_STATE_INVALID", "The action intent is not awaiting confirmation", { intentId: intent.intentId, status: intent.status });
    intent.status = decision === "approve" ? "confirmed" : "rejected";
    intent.confirmationRequired = false;
    intent.confirmedAt = new Date(now()).toISOString();
    if (decision === "approve" && rememberForSession === true) {
      const approvals = approvalsBySession.get(session) || /* @__PURE__ */ new Set();
      approvals.add(intent.scopeKey);
      approvalsBySession.set(session, approvals);
      intent.rememberedAuthorization = true;
    }
    return publicIntent(intent);
  }
  function consume(sessionId, intentId, tabId, documentId, stateDigest) {
    const session = requireSessionId2(sessionId);
    const intent = currentIntent(session, intentId);
    if (tabId != null && intent.tabId !== tabId) throw coded4("ACTION_INTENT_TAB_MISMATCH", "The action intent is bound to another tab", { intentId: intent.intentId, tabId });
    if (intent.documentId && documentId && intent.documentId !== documentId) {
      intent.status = "stale";
      intent.confirmationRequired = false;
      intent.staleReason = "document-changed";
      throw staleIntent(intent);
    }
    if (intent.stateDigest && stateDigest && intent.stateDigest !== stateDigest) {
      intent.status = "stale";
      intent.confirmationRequired = false;
      intent.staleReason = "form-state-changed";
      throw staleIntent(intent);
    }
    if (intent.status === "pending-confirmation") throw confirmationRequired(intent);
    if (intent.status === "rejected") throw coded4("ACTION_CONFIRMATION_REJECTED", "The action intent was rejected", publicIntent(intent));
    if (intent.status !== "confirmed") throw coded4("ACTION_INTENT_STATE_INVALID", "The action intent cannot be executed", { intentId: intent.intentId, status: intent.status });
    intent.status = "consumed";
    intent.executedAt = new Date(now()).toISOString();
    return { action: structuredClone(intent.action), intent: publicIntent(intent) };
  }
  function inspect(sessionId, intentId) {
    return publicIntent(currentIntent(requireSessionId2(sessionId), intentId));
  }
  function invalidateTab(sessionId, tabId, reason = "tab-state-changed") {
    const session = requireSessionId2(sessionId);
    let invalidated = 0;
    for (const intent of intentsBySession.get(session)?.values() || []) {
      if (intent.tabId !== tabId || !["pending-confirmation", "confirmed"].includes(intent.status)) continue;
      intent.status = "stale";
      intent.confirmationRequired = false;
      intent.staleReason = boundedString(String(reason), "reason", 1, 200);
      invalidated += 1;
    }
    return { tabId, invalidated };
  }
  function releaseSession(sessionId) {
    const session = requireSessionId2(sessionId);
    const intentCount = intentsBySession.get(session)?.size || 0;
    const rememberedApprovalCount = approvalsBySession.get(session)?.size || 0;
    intentsBySession.delete(session);
    approvalsBySession.delete(session);
    return { intentCount, rememberedApprovalCount };
  }
  function currentIntent(session, intentId) {
    if (typeof intentId !== "string" || !intentId) throw coded4("INVALID_PARAMS", "intentId is required");
    const intent = intentsBySession.get(session)?.get(intentId);
    if (!intent) throw coded4("ACTION_INTENT_NOT_FOUND", "The action intent does not exist in this session", { intentId });
    if (Date.parse(intent.expiresAt) <= now() && !["consumed", "rejected"].includes(intent.status)) {
      intent.status = "expired";
      intent.confirmationRequired = false;
    }
    if (intent.status === "expired") throw coded4("ACTION_INTENT_EXPIRED", "The action intent expired before execution", { intentId });
    if (intent.status === "stale") throw staleIntent(intent);
    return intent;
  }
  return { prepare, confirm, consume, inspect, invalidateTab, releaseSession };
}
function normalizeIntentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw coded4("INVALID_PARAMS", "Action intent must be an object");
  if (!Object.hasOwn(ACTION_INTENT_TYPES, input.actionType)) throw coded4("INVALID_PARAMS", "Unsupported actionType", { allowed: Object.keys(ACTION_INTENT_TYPES) });
  if (!Number.isInteger(input.tabId) || input.tabId < 0) throw coded4("INVALID_PARAMS", "tabId must be a non-negative integer");
  const summary = boundedString(input.summary, "summary", 1, 500);
  const targetOrigin = normalizeOrigin(input.targetOrigin);
  const action = normalizeAction(input.action);
  const dataTypes = input.dataTypes == null ? [] : normalizeDataTypes(input.dataTypes);
  const documentId = input.documentId == null ? null : boundedString(input.documentId, "documentId", 1, 200);
  const stateDigest = input.stateDigest == null ? null : normalizedDigest(input.stateDigest);
  return { tabId: input.tabId, documentId, stateDigest, actionType: input.actionType, riskClass: ACTION_INTENT_TYPES[input.actionType], summary, targetOrigin, dataTypes, action };
}
function normalizeAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action) || !ACTION_INTENT_METHODS.includes(action.method)) {
    throw coded4("INVALID_PARAMS", "action.method must be a supported high-level browser mutation", { allowed: ACTION_INTENT_METHODS });
  }
  if (action.params != null && (!action.params || typeof action.params !== "object" || Array.isArray(action.params))) throw coded4("INVALID_PARAMS", "action.params must be an object");
  if (Object.hasOwn(action.params || {}, "tabId")) throw coded4("INVALID_PARAMS", "action.params must not contain tabId; the intent-bound tab is used");
  return { method: action.method, params: structuredClone(action.params || {}) };
}
function normalizeDataTypes(values) {
  if (!Array.isArray(values) || values.length > 20 || values.some((value) => typeof value !== "string" || value.length < 1 || value.length > 100)) throw coded4("INVALID_PARAMS", "dataTypes must contain at most 20 non-empty strings");
  return [...new Set(values)].sort();
}
function normalizeOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw coded4("INVALID_PARAMS", "targetOrigin must be a valid URL origin");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw coded4("INVALID_PARAMS", "targetOrigin must be an exact HTTP(S) origin");
  return url.origin;
}
function scopeFor(intent) {
  return import_node_crypto2.default.createHash("sha256").update(JSON.stringify({ documentId: intent.documentId, stateDigest: intent.stateDigest, actionType: intent.actionType, targetOrigin: intent.targetOrigin, summary: intent.summary, dataTypes: intent.dataTypes, action: intent.action })).digest("hex");
}
function publicIntent(intent) {
  return {
    intentId: intent.intentId,
    tabId: intent.tabId,
    documentId: intent.documentId,
    stateDigest: intent.stateDigest,
    actionType: intent.actionType,
    riskClass: intent.riskClass,
    summary: intent.summary,
    targetOrigin: intent.targetOrigin,
    dataTypes: intent.dataTypes,
    actionMethod: intent.action.method,
    status: intent.status,
    confirmationRequired: intent.confirmationRequired,
    rememberedAuthorization: intent.rememberedAuthorization === true,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
    confirmedAt: intent.confirmedAt || null,
    executedAt: intent.executedAt || null,
    staleReason: intent.staleReason || null
  };
}
function staleIntent(intent) {
  return coded4("ACTION_INTENT_STALE", "The page or form state changed after this action intent was prepared; prepare and confirm a new intent", publicIntent(intent));
}
function confirmationRequired(intent) {
  return coded4("ACTION_CONFIRMATION_REQUIRED", "Explicit user confirmation is required before this action", publicIntent(intent));
}
function boundedString(value, field, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) throw coded4("INVALID_PARAMS", `${field} must be ${minimum} to ${maximum} characters`);
  return value;
}
function normalizedDigest(value) {
  const digest = String(value || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw coded4("INVALID_PARAMS", "stateDigest must be a SHA-256 hex digest");
  return digest;
}
function requireSessionId2(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded4("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
  return id;
}
function coded4(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

// src/native-host.mjs
var instanceId = import_node_crypto3.default.randomUUID();
var token = import_node_crypto3.default.randomBytes(32).toString("base64url");
var decoder = new NativeMessageDecoder();
var pending = /* @__PURE__ */ new Map();
var sockets = /* @__PURE__ */ new Set();
var nextRequestId = 1;
var extensionInfo = null;
var shuttingDown = false;
var descriptorPath;
var ipcEndpoint;
var sessionManager = createSessionManager();
var sessionClipboard = createSessionClipboard();
var resourceExporter = createResourceExporter();
var actionIntents = createActionIntentManager();
var temporaryViewportsBySession = /* @__PURE__ */ new Map();
var sessionCleanupTimer = setInterval(() => {
  for (const sessionId of sessionManager.expiredSessions()) void endBrowserSession(sessionId).catch(logError);
}, 3e4);
sessionCleanupTimer.unref?.();
var MUTATING_TAB_METHODS = /* @__PURE__ */ new Set([
  "browser.closeTab",
  "browser.activateTab",
  "browser.detachTab",
  "browser.navigate",
  "browser.back",
  "browser.forward",
  "browser.reload",
  "browser.click",
  "browser.fill",
  "browser.press",
  "browser.type",
  "browser.mouseMove",
  "browser.coordinateClick",
  "browser.drag",
  "browser.wheel",
  "browser.scroll",
  "browser.setFileInput",
  "browser.handleDialog",
  "browser.expectNavigation",
  "browser.check",
  "browser.uncheck",
  "browser.setChecked",
  "browser.selectOption",
  "browser.doubleClick",
  "browser.pressSequentially",
  "browser.waitForDownload",
  "browser.downloadMedia",
  "browser.waitForFileChooser",
  "browser.setFileChooserFiles",
  "browser.performAndWaitForFeedback",
  "browser.setViewport",
  "browser.resetViewport",
  "browser.exportObservedResources"
]);
var TAB_CREATING_METHODS = /* @__PURE__ */ new Set(["browser.click", "browser.coordinateClick", "browser.doubleClick", "browser.press", "browser.expectNavigation", "browser.performAndWaitForFeedback", "browser.waitForDownload", "browser.downloadMedia"]);
var ACTION_STATE_MUTATING_METHODS = /* @__PURE__ */ new Set([
  "browser.navigate",
  "browser.back",
  "browser.forward",
  "browser.reload",
  "browser.click",
  "browser.fill",
  "browser.press",
  "browser.type",
  "browser.coordinateClick",
  "browser.drag",
  "browser.check",
  "browser.uncheck",
  "browser.setChecked",
  "browser.selectOption",
  "browser.doubleClick",
  "browser.pressSequentially",
  "browser.setFileInput",
  "browser.setFileChooserFiles",
  "browser.handleDialog",
  "browser.expectNavigation",
  "browser.performAndWaitForFeedback"
]);
var server = import_node_net.default.createServer((socket) => {
  sockets.add(socket);
  socket.setEncoding("utf8");
  socket.setNoDelay(true);
  let buffer = "";
  socket.on("data", async (chunk) => {
    buffer += chunk;
    if (buffer.length > 16 * 1024 * 1024) {
      socket.destroy(new Error("JSON-RPC request buffer exceeded 16 MiB"));
      return;
    }
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request;
      try {
        request = JSON.parse(line);
        const response = await handleRpc(request);
        socket.write(`${JSON.stringify(response)}
`);
      } catch (error) {
        socket.write(`${JSON.stringify(rpcError(request?.id ?? null, error))}
`);
      }
    }
  });
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
});
import_node_process.default.stdin.on("data", (chunk) => {
  try {
    for (const message of decoder.push(chunk)) handleExtensionMessage(message);
  } catch (error) {
    logError(error);
    shutdown(1);
  }
});
import_node_process.default.stdin.on("end", () => shutdown(0));
import_node_process.default.on("SIGINT", () => shutdown(0));
import_node_process.default.on("SIGTERM", () => shutdown(0));
import_node_process.default.on("uncaughtException", (error) => {
  logError(error);
  shutdown(1);
});
import_node_process.default.on("unhandledRejection", (error) => {
  logError(error);
  shutdown(1);
});
start().catch((error) => {
  logError(error);
  shutdown(1);
});
async function start() {
  await import_promises3.default.mkdir(runtimeDirectory(), { recursive: true });
  ipcEndpoint = import_node_process.default.platform === "win32" ? `\\\\.\\pipe\\lingee-browser-agent-bridge-${instanceId}` : import_node_path4.default.join(runtimeDirectory(), `bridge-${import_node_process.default.pid}.sock`);
  if (import_node_process.default.platform !== "win32") await import_promises3.default.rm(ipcEndpoint, { force: true });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ipcEndpoint, resolve);
  });
  descriptorPath = import_node_path4.default.join(runtimeDirectory(), `bridge-${import_node_process.default.pid}.json`);
  const descriptor = {
    schemaVersion: 1,
    product: "lingee-browser-agent-bridge",
    browserFamily: "chromium",
    browserTarget: "google",
    instanceId,
    pid: import_node_process.default.pid,
    transport: "local-pipe",
    endpoint: ipcEndpoint,
    token,
    nativeHostName: HOST_NAME,
    startedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const pendingDescriptorPath = `${descriptorPath}.${import_node_crypto3.default.randomUUID()}.tmp`;
  try {
    await import_promises3.default.writeFile(pendingDescriptorPath, `${JSON.stringify(descriptor, null, 2)}
`, { encoding: "utf8", mode: 384 });
    await import_promises3.default.rename(pendingDescriptorPath, descriptorPath);
  } catch (error) {
    await import_promises3.default.rm(pendingDescriptorPath, { force: true }).catch(() => {
    });
    throw error;
  }
}
function handleExtensionMessage(message) {
  if (message?.type === "hello") {
    extensionInfo = { ...message, connectedAt: (/* @__PURE__ */ new Date()).toISOString() };
    return;
  }
  if (message?.type !== "response" || message.id == null) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  clearTimeout(waiter.timeout);
  pending.delete(message.id);
  if (message.error) waiter.reject(Object.assign(new Error(message.error.message), message.error));
  else waiter.resolve(message.result);
}
async function handleRpc(request) {
  if (!request || request.jsonrpc !== "2.0" || request.id == null || typeof request.method !== "string") {
    throw rpcCoded(-32600, "Invalid JSON-RPC request");
  }
  if (!safeTokenEqual(request.auth, token)) throw rpcCoded(-32001, "Authentication failed", { code: "AUTH_FAILED" });
  const result = await dispatch(request.method, request.params || {}, request.sessionId);
  return { jsonrpc: "2.0", id: request.id, result };
}
async function dispatch(method, params, sessionId, context = {}) {
  if (method.startsWith("_bridge.")) throw coded5("METHOD_NOT_FOUND", `Unknown browser method: ${method}`);
  if (method === "bridge.getInfo") {
    return {
      name: "Lingee Browser Agent Bridge",
      version: VERSION,
      instanceId,
      extensionConnected: extensionInfo != null,
      extension: extensionInfo,
      transport: { type: "local-pipe-jsonrpc", endpoint: ipcEndpoint, authenticated: true }
    };
  }
  if (method.startsWith("browser.") && method !== "browser.endSession") sessionManager.touch(sessionId);
  if (method === "browser.endSession") {
    assertOnlyHostParams(params, []);
    return endBrowserSession(sessionId);
  }
  if (method === "browser.getLease") {
    assertOnlyHostParams(params, ["tabId"]);
    const tabId = hostTabId(params.tabId);
    const lease = sessionManager.get(tabId);
    return lease ? { tabId: lease.tabId, temporary: lease.temporary, marker: lease.marker, createdAt: lease.createdAt, expiresAt: lease.expiresAt, ownedByCurrentSession: lease.sessionId === sessionId } : null;
  }
  if (method === "browser.transferTab") {
    assertOnlyHostParams(params, ["tabId", "targetSessionId"]);
    const tabId = hostTabId(params.tabId);
    const result2 = sessionManager.transfer(tabId, sessionId, params.targetSessionId);
    transferTemporaryViewport(tabId, sessionId, params.targetSessionId);
    return result2;
  }
  if (method === "browser.markHandoff") {
    assertOnlyHostParams(params, ["tabId"]);
    return sessionManager.mark(hostTabId(params.tabId), sessionId, "handoff");
  }
  if (method === "browser.markDeliverable") {
    assertOnlyHostParams(params, ["tabId"]);
    return sessionManager.mark(hostTabId(params.tabId), sessionId, "deliverable");
  }
  if (method.startsWith("policy.")) return handlePolicy(method, params);
  if (method === "browser.sessionClipboardWrite") {
    assertOnlyHostParams(params, ["items"]);
    const policy2 = await loadPolicy();
    if (!policy2.allowSessionClipboardWrite) throw coded5("SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED", "Browser session clipboard write access is disabled by policy");
    return sessionClipboard.write(sessionId, params.items);
  }
  if (method === "browser.sessionClipboardRead") {
    assertOnlyHostParams(params, ["mimeTypes"]);
    const policy2 = await loadPolicy();
    if (!policy2.allowSessionClipboardRead) throw coded5("SESSION_CLIPBOARD_READ_APPROVAL_REQUIRED", "Browser session clipboard read access is disabled by policy");
    return sessionClipboard.read(sessionId, params.mimeTypes);
  }
  if (method === "browser.sessionClipboardClear") {
    assertOnlyHostParams(params, []);
    const policy2 = await loadPolicy();
    if (!policy2.allowSessionClipboardWrite) throw coded5("SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED", "Browser session clipboard write access is disabled by policy");
    return sessionClipboard.clear(sessionId);
  }
  if (!extensionInfo) throw coded5("EXTENSION_NOT_READY", "Browser extension has not completed the native messaging handshake");
  if (method === "browser.prepareActionIntent") {
    assertOnlyHostParams(params, ["tabId", "actionType", "summary", "dataTypes", "action"]);
    const tabId = hostTabId(params.tabId);
    sessionManager.assertOwner(tabId, sessionId);
    const policy2 = await loadPolicy();
    const tab = await sendToExtension("browser.getTab", { tabId });
    assertTabUrlAllowed(policy2, tab.url);
    const identity = await sendToExtension("_bridge.getDocumentIdentity", { tabId });
    return actionIntents.prepare(sessionId, { ...params, tabId, documentId: identity.documentId, stateDigest: identity.stateDigest, targetOrigin: new URL(tab.url).origin });
  }
  if (method === "browser.confirmActionIntent") {
    assertOnlyHostParams(params, ["intentId", "decision", "rememberForSession"]);
    return actionIntents.confirm(sessionId, params);
  }
  if (method === "browser.executeActionIntent") {
    assertOnlyHostParams(params, ["intentId"]);
    const prepared = actionIntents.inspect(sessionId, params.intentId);
    sessionManager.assertOwner(prepared.tabId, sessionId);
    if (prepared.status !== "confirmed") {
      actionIntents.consume(sessionId, params.intentId, prepared.tabId, prepared.documentId, prepared.stateDigest);
    }
    const policy2 = await loadPolicy();
    const identity = await sendToExtension("_bridge.getDocumentIdentity", { tabId: prepared.tabId });
    assertTabUrlAllowed(policy2, identity.url);
    if (new URL(identity.url).origin !== prepared.targetOrigin) {
      actionIntents.invalidateTab(sessionId, prepared.tabId, "origin-changed");
      throw coded5("ACTION_INTENT_STALE", "The page origin changed after this action intent was prepared", { intentId: prepared.intentId, targetOrigin: prepared.targetOrigin, currentOrigin: new URL(identity.url).origin });
    }
    const consumed = actionIntents.consume(sessionId, params.intentId, prepared.tabId, identity.documentId, identity.stateDigest);
    const actionResult = await dispatch(consumed.action.method, { tabId: consumed.intent.tabId, ...consumed.action.params }, sessionId, { intentAuthorized: true });
    return { intent: consumed.intent, actionResult };
  }
  if (method === "browser.openTab") sessionManager.touch(sessionId);
  if (method === "browser.groupTabs") {
    if (!Array.isArray(params.tabIds) || !params.tabIds.length) throw coded5("INVALID_PARAMS", "tabIds must be a non-empty array");
    for (const tabId of params.tabIds) sessionManager.assertOwner(hostTabId(tabId), sessionId);
  }
  if (MUTATING_TAB_METHODS.has(method)) sessionManager.assertOwner(params.tabId, sessionId);
  let policy = await loadPolicy();
  if (method === "browser.cdp") assertCdpAllowed(policy, params.command);
  if (["browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"].includes(method) && !policy.allowSensitiveMetadata) {
    throw coded5("SENSITIVE_METADATA_APPROVAL_REQUIRED", "History, bookmarks, and downloads access is disabled by policy");
  }
  if (["browser.navigate", "browser.openTab"].includes(method)) assertUrlAllowed(policy, params.url || "about:blank");
  if (method === "browser.expectNavigation" && params.action?.method === "browser.navigate") {
    assertUrlAllowed(policy, params.action?.params?.url || "about:blank");
  }
  if (["browser.setFileInput", "browser.setFileChooserFiles"].includes(method)) {
    if (context.intentAuthorized !== true) throw coded5("ACTION_INTENT_REQUIRED", "File upload must use a confirmed upload action intent", { actionType: "upload", confirmationRequired: true });
    await validateUploadFiles(params.files);
  }
  if (method === "browser.listTabs") {
    const tabs = await sendToExtension(method, params);
    return tabs.map((tab) => sanitizeTab(policy, tab));
  }
  if (method === "browser.getTab") {
    return sanitizeTab(policy, await sendToExtension(method, params));
  }
  if (requiresApprovedCurrentSite(method)) {
    const tab = await sendToExtension("browser.getTab", { tabId: params.tabId });
    assertTabUrlAllowed(policy, tab.url);
  }
  for (const framePath of collectFramePaths(params)) {
    let resolved;
    try {
      resolved = await sendToExtension("_bridge.resolveFramePath", { tabId: params.tabId, framePath });
    } catch (error) {
      const absentFrameCompletesWait = method === "browser.waitFor" && ["detached", "hidden"].includes(String(params.state || "")) && ["FRAME_NOT_FOUND", "FRAME_CONTEXT_CHANGED"].includes(error.code);
      if (absentFrameCompletesWait) continue;
      throw error;
    }
    for (const frame of resolved?.frames || []) assertTabUrlAllowed(policy, frame.url);
  }
  if (method === "browser.exportObservedResources") {
    assertOnlyHostParams(params, ["tabId", "resourceIds"]);
    if (!Array.isArray(params.resourceIds) || params.resourceIds.length < 1 || params.resourceIds.length > 20) throw coded5("RESOURCE_SELECTION_INVALID", "resourceIds must contain 1 to 20 items");
    const payload = await sendToExtension("_bridge.collectObservedResources", { tabId: params.tabId, resourceIds: params.resourceIds }, 6e4);
    assertTabUrlAllowed(policy, payload?.pageUrl);
    for (const resource of payload?.resources || []) assertTabUrlAllowed(policy, resource.url);
    return resourceExporter.exportArchive(sessionId, payload);
  }
  if (method === "browser.downloadMedia") {
    const target = await sendToExtension("_bridge.resolveDownloadTarget", { tabId: params.tabId, locator: params.locator, framePath: params.framePath });
    assertDownloadUrlAllowed(policy, target?.url);
  }
  const actionStartedAt = Date.now();
  let result;
  let actionError;
  try {
    result = await sendToExtension(method, params);
  } catch (error) {
    actionError = error;
  }
  if (method === "browser.claimTab") sessionManager.acquire(params.tabId, sessionId, { temporary: false });
  if (method === "browser.openTab" && result?.id != null) sessionManager.acquire(result.id, sessionId, { temporary: true });
  for (const tabId of result?.createdTabIds || []) sessionManager.acquire(tabId, sessionId, { temporary: true });
  if (TAB_CREATING_METHODS.has(method)) {
    const created = await sendToExtension("_bridge.consumeCreatedTabs", { tabId: params.tabId, since: actionStartedAt, settleMs: 250 }).catch(() => ({ tabIds: [] }));
    for (const tabId of created?.tabIds || []) sessionManager.acquire(tabId, sessionId, { temporary: true });
  }
  if (actionError) throw actionError;
  if (method === "browser.setViewport") {
    if (params.preserveOnSessionEnd === true) forgetTemporaryViewport(params.tabId);
    else rememberTemporaryViewport(sessionId, params.tabId);
  }
  if (method === "browser.resetViewport") forgetTemporaryViewport(params.tabId);
  if (method === "browser.closeTab" && params.tabId != null) sessionManager.forgetTab(params.tabId);
  if (method === "browser.closeTab" && params.tabId != null) forgetTemporaryViewport(params.tabId);
  if (method === "browser.waitForURL") assertTabUrlAllowed(policy, result?.url);
  if (method === "browser.waitForLoadState") assertTabUrlAllowed(policy, result?.url);
  if (method === "browser.expectNavigation") assertTabUrlAllowed(policy, result?.navigation?.toUrl || result?.navigation?.url);
  if (method === "browser.waitForDownload" || method === "browser.downloadMedia") assertDownloadUrlAllowed(policy, result?.download?.url);
  if (method === "browser.getConsoleLogs" && Array.isArray(result?.logs)) {
    result.logs = result.logs.map((entry) => ({ ...entry, url: sanitizeSourceUrl(policy, entry.url) }));
  }
  if (context.intentAuthorized !== true && ACTION_STATE_MUTATING_METHODS.has(method) && params.tabId != null) {
    actionIntents.invalidateTab(sessionId, params.tabId, method);
  }
  if (method === "browser.listObservedResources" && Array.isArray(result?.resources)) {
    const resources = result.resources.filter((resource) => {
      try {
        assertTabUrlAllowed(policy, resource.url);
        return true;
      } catch {
        return false;
      }
    });
    result = { ...result, resources, resourceCount: resources.length, omittedUnapproved: result.resources.length - resources.length, truncated: result.truncated === true || resources.length !== result.resources.length };
  }
  return result;
}
async function validateUploadFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) throw coded5("INVALID_PARAMS", "files must contain 1 to 20 absolute file paths");
  for (const file of files) {
    if (typeof file !== "string" || !import_node_path4.default.isAbsolute(file)) throw coded5("UPLOAD_FILE_INVALID", "Every upload path must be absolute");
    const stats = await import_promises3.default.stat(file).catch(() => null);
    if (!stats?.isFile()) throw coded5("UPLOAD_FILE_NOT_FOUND", `Upload file does not exist or is not a regular file: ${import_node_path4.default.basename(file)}`);
  }
}
function sanitizeSourceUrl(policy, value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !isHostAllowed(policy, url.hostname)) return null;
    return `${url.origin}${url.pathname}`.slice(0, 2048);
  } catch {
    return null;
  }
}
function assertDownloadUrlAllowed(policy, value) {
  if (!value) return;
  const protocol = new URL(value).protocol;
  if (["data:", "blob:"].includes(protocol)) return;
  assertTabUrlAllowed(policy, value);
}
async function endBrowserSession(sessionId) {
  const leases = sessionManager.releaseSession(sessionId);
  const clipboard = sessionClipboard.releaseSession(sessionId);
  const resourceExports = await resourceExporter.releaseSession(sessionId);
  const actionIntentCleanup = actionIntents.releaseSession(sessionId);
  const viewportTabs = releaseTemporaryViewports(sessionId);
  const viewportReset = [];
  const viewportResetFailed = [];
  for (const tabId of viewportTabs) {
    try {
      await sendToExtension("browser.resetViewport", { tabId });
      viewportReset.push(tabId);
    } catch (error) {
      viewportResetFailed.push({ tabId, code: error.code || "VIEWPORT_RESET_FAILED" });
    }
  }
  const closed = [];
  const preserved = [];
  for (const lease of leases) {
    if (!lease.temporary || lease.marker) {
      preserved.push({ ...lease, reason: lease.marker || "user-tab" });
      continue;
    }
    try {
      const inspection = await sendToExtension("_bridge.inspectUnsavedWork", { tabId: lease.tabId });
      if (inspection?.unsaved) {
        preserved.push({ ...lease, reason: "unsaved-work" });
        continue;
      }
      await sendToExtension("browser.closeTab", { tabId: lease.tabId });
      closed.push(lease.tabId);
    } catch (error) {
      preserved.push({ ...lease, reason: error.code === "TAB_NOT_FOUND" ? "already-closed" : "cleanup-failed" });
    }
  }
  return { closed, preserved, clipboardCleared: clipboard.cleared, resourceExportsRemoved: resourceExports.removed, actionIntentsCleared: actionIntentCleanup.intentCount, rememberedActionApprovalsCleared: actionIntentCleanup.rememberedApprovalCount, viewportReset, viewportResetFailed };
}
function rememberTemporaryViewport(sessionId, tabId) {
  const set = temporaryViewportsBySession.get(sessionId) || /* @__PURE__ */ new Set();
  set.add(tabId);
  temporaryViewportsBySession.set(sessionId, set);
}
function forgetTemporaryViewport(tabId) {
  for (const [sessionId, tabs] of temporaryViewportsBySession) {
    tabs.delete(tabId);
    if (!tabs.size) temporaryViewportsBySession.delete(sessionId);
  }
}
function transferTemporaryViewport(tabId, sourceSessionId, targetSessionId) {
  const source = temporaryViewportsBySession.get(sourceSessionId);
  if (!source?.delete(tabId)) return;
  if (!source.size) temporaryViewportsBySession.delete(sourceSessionId);
  rememberTemporaryViewport(targetSessionId, tabId);
}
function releaseTemporaryViewports(sessionId) {
  const tabs = [...temporaryViewportsBySession.get(sessionId) || []];
  temporaryViewportsBySession.delete(sessionId);
  return tabs;
}
function collectFramePaths(params) {
  const paths = [];
  if (Array.isArray(params?.framePath) && params.framePath.length) paths.push(params.framePath);
  for (const endpoint of [params?.from, params?.to]) {
    if (Array.isArray(endpoint?.framePath) && endpoint.framePath.length) paths.push(endpoint.framePath);
  }
  if (Array.isArray(params?.action?.params?.framePath) && params.action.params.framePath.length) paths.push(params.action.params.framePath);
  return paths;
}
function assertOnlyHostParams(params, allowed) {
  const unknown = Object.keys(params || {}).filter((key) => !allowed.includes(key));
  if (unknown.length) throw coded5("INVALID_PARAMS", `Unknown parameter: ${unknown[0]}`, { field: unknown[0] });
  return params;
}
function hostTabId(value) {
  if (!Number.isInteger(value) || value < 0) throw coded5("INVALID_PARAMS", "tabId must be a non-negative integer");
  return value;
}
async function handlePolicy(method, params) {
  const policy = await loadPolicy();
  if (method === "policy.get") return policy;
  if (method === "policy.allowHost") {
    const host = normalizeHost(params.host);
    policy.allowedHosts = [.../* @__PURE__ */ new Set([...policy.allowedHosts, host])].sort();
    policy.blockedHosts = policy.blockedHosts.filter((entry) => entry !== host);
    return savePolicy(policy);
  }
  if (method === "policy.blockHost") {
    const host = normalizeHost(params.host);
    policy.blockedHosts = [.../* @__PURE__ */ new Set([...policy.blockedHosts, host])].sort();
    policy.allowedHosts = policy.allowedHosts.filter((entry) => entry !== host);
    return savePolicy(policy);
  }
  if (method === "policy.setAllowAll") {
    policy.allowAll = params.enabled === true;
    return savePolicy(policy);
  }
  if (method === "policy.setSensitiveMetadata") {
    policy.allowSensitiveMetadata = params.enabled === true;
    return savePolicy(policy);
  }
  if (method === "policy.setSessionClipboardRead") {
    assertOnlyHostParams(params, ["enabled"]);
    policy.allowSessionClipboardRead = params.enabled === true;
    return savePolicy(policy);
  }
  if (method === "policy.setSessionClipboardWrite") {
    assertOnlyHostParams(params, ["enabled"]);
    policy.allowSessionClipboardWrite = params.enabled === true;
    return savePolicy(policy);
  }
  if (method === "policy.allowCdpMethod") {
    const command = String(params.command || "").trim();
    if (!command) throw coded5("INVALID_PARAMS", "command is required");
    policy.allowedCdpMethods = [.../* @__PURE__ */ new Set([...policy.allowedCdpMethods, command])].sort();
    return savePolicy(policy);
  }
  throw coded5("METHOD_NOT_FOUND", `Unknown policy method: ${method}`);
}
function sendToExtension(method, params, timeoutMs = 3e4) {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(coded5("BROWSER_TIMEOUT", `${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    try {
      import_node_process.default.stdout.write(encodeNativeMessage({ type: "request", id, method, params }));
    } catch (error) {
      clearTimeout(timeout);
      pending.delete(id);
      reject(error);
    }
  });
}
function sanitizeTab(policy, tab) {
  if (!tab?.url || /^(about|chrome|chrome-extension):/.test(tab.url)) return tab;
  try {
    const url = new URL(tab.url);
    if (isHostAllowed(policy, url.hostname)) return { ...tab, approved: true };
    return {
      id: tab.id,
      windowId: tab.windowId,
      index: tab.index,
      active: tab.active,
      pinned: tab.pinned,
      status: tab.status,
      approved: false,
      host: url.hostname
    };
  } catch {
    return { id: tab.id, windowId: tab.windowId, active: tab.active, approved: false };
  }
}
function assertTabUrlAllowed(policy, value) {
  if (!value || /^(about|chrome|chrome-extension):/.test(value)) return;
  assertUrlAllowed(policy, value);
}
function requiresApprovedCurrentSite(method) {
  return !(/* @__PURE__ */ new Set([
    "browser.getInfo",
    "browser.listTabs",
    "browser.getTab",
    "browser.openTab",
    "browser.activateTab",
    "browser.groupTabs",
    "browser.historySearch",
    "browser.bookmarkSearch",
    "browser.downloadsSearch"
  ])).has(method);
}
function safeTokenEqual(candidate, expected) {
  if (typeof candidate !== "string") return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && import_node_crypto3.default.timingSafeEqual(left, right);
}
function rpcError(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: Number.isInteger(error.rpcCode) ? error.rpcCode : -32e3,
      message: error.message || String(error),
      data: { code: error.code || "BRIDGE_ERROR", ...error.data ? { details: error.data } : {} }
    }
  };
}
function coded5(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
function rpcCoded(rpcCode, message, data) {
  return Object.assign(new Error(message), { rpcCode, data });
}
function logError(error) {
  import_node_process.default.stderr.write(`[lingee-browser-agent-bridge] ${error?.stack || error}
`);
}
async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sessionCleanupTimer);
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timeout);
    waiter.reject(coded5("HOST_SHUTDOWN", "Native host is shutting down"));
  }
  pending.clear();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
  await resourceExporter.releaseAll().catch(() => {
  });
  if (descriptorPath) await import_promises3.default.rm(descriptorPath, { force: true }).catch(() => {
  });
  if (ipcEndpoint && import_node_process.default.platform !== "win32") await import_promises3.default.rm(ipcEndpoint, { force: true }).catch(() => {
  });
  import_node_process.default.exit(exitCode);
}
