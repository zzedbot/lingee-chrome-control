#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { NativeMessageDecoder, encodeNativeMessage } from "./native-framing.mjs";
import { assertCdpAllowed, assertUrlAllowed, isHostAllowed, loadPolicy, normalizeHost, savePolicy } from "./policy.mjs";
import { HOST_NAME, runtimeDirectory } from "./runtime-paths.mjs";
import { VERSION } from "./version.mjs";
import { createSessionManager } from "./session-manager.mjs";
import { createSessionClipboard } from "./session-clipboard.mjs";
import { createResourceExporter } from "./resource-export.mjs";
import { createActionIntentManager } from "./action-intents.mjs";

const instanceId = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("base64url");
const decoder = new NativeMessageDecoder();
const pending = new Map();
const sockets = new Set();
let nextRequestId = 1;
let extensionInfo = null;
let shuttingDown = false;
let descriptorPath;
let ipcEndpoint;
const sessionManager = createSessionManager();
const sessionClipboard = createSessionClipboard();
const resourceExporter = createResourceExporter();
const actionIntents = createActionIntentManager();
const temporaryViewportsBySession = new Map();
const sessionCleanupTimer = setInterval(() => {
  for (const sessionId of sessionManager.expiredSessions()) void endBrowserSession(sessionId).catch(logError);
}, 30000);
sessionCleanupTimer.unref?.();
const MUTATING_TAB_METHODS = new Set([
  "browser.closeTab", "browser.activateTab", "browser.detachTab", "browser.navigate", "browser.back", "browser.forward", "browser.reload",
  "browser.click", "browser.fill", "browser.press", "browser.type", "browser.mouseMove", "browser.coordinateClick", "browser.drag", "browser.wheel", "browser.scroll", "browser.setFileInput", "browser.handleDialog", "browser.expectNavigation",
  "browser.check", "browser.uncheck", "browser.setChecked", "browser.selectOption", "browser.doubleClick", "browser.pressSequentially",
  "browser.waitForDownload", "browser.downloadMedia", "browser.waitForFileChooser", "browser.setFileChooserFiles",
  "browser.performAndWaitForFeedback",
  "browser.setViewport", "browser.resetViewport", "browser.exportObservedResources"
]);
const TAB_CREATING_METHODS = new Set(["browser.click", "browser.coordinateClick", "browser.doubleClick", "browser.press", "browser.expectNavigation", "browser.performAndWaitForFeedback", "browser.waitForDownload", "browser.downloadMedia"]);
const ACTION_STATE_MUTATING_METHODS = new Set([
  "browser.navigate", "browser.back", "browser.forward", "browser.reload",
  "browser.click", "browser.fill", "browser.press", "browser.type", "browser.coordinateClick", "browser.drag",
  "browser.check", "browser.uncheck", "browser.setChecked", "browser.selectOption", "browser.doubleClick", "browser.pressSequentially",
  "browser.setFileInput", "browser.setFileChooserFiles", "browser.handleDialog", "browser.expectNavigation", "browser.performAndWaitForFeedback"
]);

const server = net.createServer((socket) => {
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
        socket.write(`${JSON.stringify(response)}\n`);
      } catch (error) {
        socket.write(`${JSON.stringify(rpcError(request?.id ?? null, error))}\n`);
      }
    }
  });
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
});

process.stdin.on("data", (chunk) => {
  try {
    for (const message of decoder.push(chunk)) handleExtensionMessage(message);
  } catch (error) {
    logError(error);
    shutdown(1);
  }
});
process.stdin.on("end", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => { logError(error); shutdown(1); });
process.on("unhandledRejection", (error) => { logError(error); shutdown(1); });

start().catch((error) => {
  logError(error);
  shutdown(1);
});

async function start() {
  await fsp.mkdir(runtimeDirectory(), { recursive: true });
  ipcEndpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\lingee-browser-agent-bridge-${instanceId}`
    : path.join(runtimeDirectory(), `bridge-${process.pid}.sock`);
  if (process.platform !== "win32") await fsp.rm(ipcEndpoint, { force: true });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ipcEndpoint, resolve);
  });
  descriptorPath = path.join(runtimeDirectory(), `bridge-${process.pid}.json`);
  const descriptor = {
    schemaVersion: 1,
    product: "lingee-browser-agent-bridge",
    browserFamily: "chromium",
    browserTarget: "google",
    instanceId,
    pid: process.pid,
    transport: "local-pipe",
    endpoint: ipcEndpoint,
    token,
    nativeHostName: HOST_NAME,
    startedAt: new Date().toISOString()
  };
  const pendingDescriptorPath = `${descriptorPath}.${crypto.randomUUID()}.tmp`;
  try {
    await fsp.writeFile(pendingDescriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fsp.rename(pendingDescriptorPath, descriptorPath);
  } catch (error) {
    await fsp.rm(pendingDescriptorPath, { force: true }).catch(() => {});
    throw error;
  }
}

function handleExtensionMessage(message) {
  if (message?.type === "hello") {
    extensionInfo = { ...message, connectedAt: new Date().toISOString() };
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
  if (method.startsWith("_bridge.")) throw coded("METHOD_NOT_FOUND", `Unknown browser method: ${method}`);
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
  if (method === "browser.endSession") { assertOnlyHostParams(params, []); return endBrowserSession(sessionId); }
  if (method === "browser.getLease") {
    assertOnlyHostParams(params, ["tabId"]);
    const tabId = hostTabId(params.tabId);
    const lease = sessionManager.get(tabId);
    return lease ? { tabId: lease.tabId, temporary: lease.temporary, marker: lease.marker, createdAt: lease.createdAt, expiresAt: lease.expiresAt, ownedByCurrentSession: lease.sessionId === sessionId } : null;
  }
  if (method === "browser.transferTab") {
    assertOnlyHostParams(params, ["tabId", "targetSessionId"]);
    const tabId = hostTabId(params.tabId);
    const result = sessionManager.transfer(tabId, sessionId, params.targetSessionId);
    transferTemporaryViewport(tabId, sessionId, params.targetSessionId);
    return result;
  }
  if (method === "browser.markHandoff") { assertOnlyHostParams(params, ["tabId"]); return sessionManager.mark(hostTabId(params.tabId), sessionId, "handoff"); }
  if (method === "browser.markDeliverable") { assertOnlyHostParams(params, ["tabId"]); return sessionManager.mark(hostTabId(params.tabId), sessionId, "deliverable"); }
  if (method.startsWith("policy.")) return handlePolicy(method, params);
  if (method === "browser.sessionClipboardWrite") {
    assertOnlyHostParams(params, ["items"]);
    const policy = await loadPolicy();
    if (!policy.allowSessionClipboardWrite) throw coded("SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED", "Browser session clipboard write access is disabled by policy");
    return sessionClipboard.write(sessionId, params.items);
  }
  if (method === "browser.sessionClipboardRead") {
    assertOnlyHostParams(params, ["mimeTypes"]);
    const policy = await loadPolicy();
    if (!policy.allowSessionClipboardRead) throw coded("SESSION_CLIPBOARD_READ_APPROVAL_REQUIRED", "Browser session clipboard read access is disabled by policy");
    return sessionClipboard.read(sessionId, params.mimeTypes);
  }
  if (method === "browser.sessionClipboardClear") {
    assertOnlyHostParams(params, []);
    const policy = await loadPolicy();
    if (!policy.allowSessionClipboardWrite) throw coded("SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED", "Browser session clipboard write access is disabled by policy");
    return sessionClipboard.clear(sessionId);
  }
  if (!extensionInfo) throw coded("EXTENSION_NOT_READY", "Browser extension has not completed the native messaging handshake");

  if (method === "browser.prepareActionIntent") {
    assertOnlyHostParams(params, ["tabId", "actionType", "summary", "dataTypes", "action"]);
    const tabId = hostTabId(params.tabId);
    sessionManager.assertOwner(tabId, sessionId);
    const policy = await loadPolicy();
    const tab = await sendToExtension("browser.getTab", { tabId });
    assertTabUrlAllowed(policy, tab.url);
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
    const policy = await loadPolicy();
    const identity = await sendToExtension("_bridge.getDocumentIdentity", { tabId: prepared.tabId });
    assertTabUrlAllowed(policy, identity.url);
    if (new URL(identity.url).origin !== prepared.targetOrigin) {
      actionIntents.invalidateTab(sessionId, prepared.tabId, "origin-changed");
      throw coded("ACTION_INTENT_STALE", "The page origin changed after this action intent was prepared", { intentId: prepared.intentId, targetOrigin: prepared.targetOrigin, currentOrigin: new URL(identity.url).origin });
    }
    const consumed = actionIntents.consume(sessionId, params.intentId, prepared.tabId, identity.documentId, identity.stateDigest);
    const actionResult = await dispatch(consumed.action.method, { tabId: consumed.intent.tabId, ...consumed.action.params }, sessionId, { intentAuthorized: true });
    return { intent: consumed.intent, actionResult };
  }

  if (method === "browser.openTab") sessionManager.touch(sessionId);
  if (method === "browser.groupTabs") {
    if (!Array.isArray(params.tabIds) || !params.tabIds.length) throw coded("INVALID_PARAMS", "tabIds must be a non-empty array");
    for (const tabId of params.tabIds) sessionManager.assertOwner(hostTabId(tabId), sessionId);
  }
  if (MUTATING_TAB_METHODS.has(method)) sessionManager.assertOwner(params.tabId, sessionId);

  let policy = await loadPolicy();
  if (method === "browser.cdp") assertCdpAllowed(policy, params.command);
  if (["browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"].includes(method) && !policy.allowSensitiveMetadata) {
    throw coded("SENSITIVE_METADATA_APPROVAL_REQUIRED", "History, bookmarks, and downloads access is disabled by policy");
  }
  if (["browser.navigate", "browser.openTab"].includes(method)) assertUrlAllowed(policy, params.url || "about:blank");
  if (method === "browser.expectNavigation" && params.action?.method === "browser.navigate") {
    assertUrlAllowed(policy, params.action?.params?.url || "about:blank");
  }
  if (["browser.setFileInput", "browser.setFileChooserFiles"].includes(method)) {
    if (context.intentAuthorized !== true) throw coded("ACTION_INTENT_REQUIRED", "File upload must use a confirmed upload action intent", { actionType: "upload", confirmationRequired: true });
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
      const absentFrameCompletesWait = method === "browser.waitFor"
        && ["detached", "hidden"].includes(String(params.state || ""))
        && ["FRAME_NOT_FOUND", "FRAME_CONTEXT_CHANGED"].includes(error.code);
      if (absentFrameCompletesWait) continue;
      throw error;
    }
    for (const frame of resolved?.frames || []) assertTabUrlAllowed(policy, frame.url);
  }
  if (method === "browser.exportObservedResources") {
    assertOnlyHostParams(params, ["tabId", "resourceIds"]);
    if (!Array.isArray(params.resourceIds) || params.resourceIds.length < 1 || params.resourceIds.length > 20) throw coded("RESOURCE_SELECTION_INVALID", "resourceIds must contain 1 to 20 items");
    const payload = await sendToExtension("_bridge.collectObservedResources", { tabId: params.tabId, resourceIds: params.resourceIds }, 60000);
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
      try { assertTabUrlAllowed(policy, resource.url); return true; } catch { return false; }
    });
    result = { ...result, resources, resourceCount: resources.length, omittedUnapproved: result.resources.length - resources.length, truncated: result.truncated === true || resources.length !== result.resources.length };
  }
  return result;
}

async function validateUploadFiles(files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 20) throw coded("INVALID_PARAMS", "files must contain 1 to 20 absolute file paths");
  for (const file of files) {
    if (typeof file !== "string" || !path.isAbsolute(file)) throw coded("UPLOAD_FILE_INVALID", "Every upload path must be absolute");
    const stats = await fsp.stat(file).catch(() => null);
    if (!stats?.isFile()) throw coded("UPLOAD_FILE_NOT_FOUND", `Upload file does not exist or is not a regular file: ${path.basename(file)}`);
  }
}

function sanitizeSourceUrl(policy, value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || !isHostAllowed(policy, url.hostname)) return null;
    return `${url.origin}${url.pathname}`.slice(0, 2048);
  } catch { return null; }
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
    if (!lease.temporary || lease.marker) { preserved.push({ ...lease, reason: lease.marker || "user-tab" }); continue; }
    try {
      const inspection = await sendToExtension("_bridge.inspectUnsavedWork", { tabId: lease.tabId });
      if (inspection?.unsaved) { preserved.push({ ...lease, reason: "unsaved-work" }); continue; }
      await sendToExtension("browser.closeTab", { tabId: lease.tabId });
      closed.push(lease.tabId);
    } catch (error) {
      preserved.push({ ...lease, reason: error.code === "TAB_NOT_FOUND" ? "already-closed" : "cleanup-failed" });
    }
  }
  return { closed, preserved, clipboardCleared: clipboard.cleared, resourceExportsRemoved: resourceExports.removed, actionIntentsCleared: actionIntentCleanup.intentCount, rememberedActionApprovalsCleared: actionIntentCleanup.rememberedApprovalCount, viewportReset, viewportResetFailed };
}

function rememberTemporaryViewport(sessionId, tabId) {
  const set = temporaryViewportsBySession.get(sessionId) || new Set();
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
  const tabs = [...(temporaryViewportsBySession.get(sessionId) || [])];
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
  if (unknown.length) throw coded("INVALID_PARAMS", `Unknown parameter: ${unknown[0]}`, { field: unknown[0] });
  return params;
}

function hostTabId(value) {
  if (!Number.isInteger(value) || value < 0) throw coded("INVALID_PARAMS", "tabId must be a non-negative integer");
  return value;
}

async function handlePolicy(method, params) {
  const policy = await loadPolicy();
  if (method === "policy.get") return policy;
  if (method === "policy.allowHost") {
    const host = normalizeHost(params.host);
    policy.allowedHosts = [...new Set([...policy.allowedHosts, host])].sort();
    policy.blockedHosts = policy.blockedHosts.filter((entry) => entry !== host);
    return savePolicy(policy);
  }
  if (method === "policy.blockHost") {
    const host = normalizeHost(params.host);
    policy.blockedHosts = [...new Set([...policy.blockedHosts, host])].sort();
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
    if (!command) throw coded("INVALID_PARAMS", "command is required");
    policy.allowedCdpMethods = [...new Set([...policy.allowedCdpMethods, command])].sort();
    return savePolicy(policy);
  }
  throw coded("METHOD_NOT_FOUND", `Unknown policy method: ${method}`);
}

function sendToExtension(method, params, timeoutMs = 30000) {
  const id = nextRequestId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(coded("BROWSER_TIMEOUT", `${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timeout });
    try {
      process.stdout.write(encodeNativeMessage({ type: "request", id, method, params }));
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
  return !new Set([
    "browser.getInfo", "browser.listTabs", "browser.getTab", "browser.openTab",
    "browser.activateTab", "browser.groupTabs", "browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"
  ]).has(method);
}

function safeTokenEqual(candidate, expected) {
  if (typeof candidate !== "string") return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function rpcError(id, error) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code: Number.isInteger(error.rpcCode) ? error.rpcCode : -32000,
      message: error.message || String(error),
      data: { code: error.code || "BRIDGE_ERROR", ...(error.data ? { details: error.data } : {}) }
    }
  };
}

function coded(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

function rpcCoded(rpcCode, message, data) {
  return Object.assign(new Error(message), { rpcCode, data });
}

function logError(error) {
  process.stderr.write(`[lingee-browser-agent-bridge] ${error?.stack || error}\n`);
}

async function shutdown(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(sessionCleanupTimer);
  for (const waiter of pending.values()) {
    clearTimeout(waiter.timeout);
    waiter.reject(coded("HOST_SHUTDOWN", "Native host is shutting down"));
  }
  pending.clear();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
  await resourceExporter.releaseAll().catch(() => {});
  if (descriptorPath) await fsp.rm(descriptorPath, { force: true }).catch(() => {});
  if (ipcEndpoint && process.platform !== "win32") await fsp.rm(ipcEndpoint, { force: true }).catch(() => {});
  process.exit(exitCode);
}
