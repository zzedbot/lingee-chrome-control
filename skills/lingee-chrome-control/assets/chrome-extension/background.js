import { expandFrameIdSubtree, installMonitorsForTab, isMonitorablePageFrame } from "./monitor-injection.js";
import { createDebuggerController } from "./debugger-controller.js";
import { FOREIGN_FRAME_MONITOR_KEY, installForeignFrameMonitor, removeForeignFrameMonitor, readForeignFrameMonitorDiagnostics } from "./foreign-frame-monitor.js";
import { VIRTUAL_CURSOR_KEY, removeVirtualCursor, renderVirtualCursor } from "./virtual-cursor.js";
import { createTabOperationQueue } from "./tab-operation-queue.js";
import { runLocatorQuery, validateLocatorQuery, validateLocatorQueryOptions } from "./locator-query.js";
import { FRAME_WORLD_NAME, resolveFrameElement, validateFramePath } from "./frame-locator.js";
import { applySelectOptions, inspectLocatedControl, normalizeSelections } from "./form-controls.js";

const HOST_NAME = "org.universal_browser.bridge";
const CDP_VERSION = "1.3";
const MAX_EVENTS = 1000;
const CURSOR_MIN_MOTION_MS = 180;
const CURSOR_MAX_MOTION_MS = 360;
const CURSOR_SETTLE_MS = 70;
const CURSOR_RECOVERY_DELAYS_MS = [0, 40, 120, 300];
const CURSOR_PRESS_HOLD_MS = 80;
const CLICK_FEEDBACK_MS = 560;
const WHEEL_FEEDBACK_MIN_MS = 120;
const DRAG_FRAME_MS = 16;

let nativePort;
let connected = false;
let lastError = "";
let reconnectTimer;
let eventSequence = 0;
const events = [];

const debuggerController = createDebuggerController({
  debuggerApi: chrome.debugger,
  cdpVersion: CDP_VERSION,
  installMonitor: installForeignFrameMonitorInTab,
  diagnoseFailure: readMonitorDiagnosticsInTab,
  removeMonitor: removeForeignFrameMonitorFromTab
});
const { attachedTabs, controlledTabs } = debuggerController;
const monitoredDocumentsByTab = new Map();
const neutralizedFrameIdsByTab = new Map();
const cursorPositionsByTab = new Map();
const jsDialogsByTab = new Map();
const dialogOpenWaitersByTab = new Map();
const dialogCloseWaitersByTab = new Map();
const networkRequestsByTab = new Map();
const networkIdleSinceByTab = new Map();
const downloadWaitersByTab = new Map();
const downloadsByGuid = new Map();
const fileChooserWaitersByTab = new Map();
const fileChoosers = new Map();
const consoleLogsByTab = new Map();
const oopifSessionsByTab = new Map();
const oopifSessionWaitersByTab = new Map();
const createdTabs = [];
let nextDialogId = 1;
let nextFileChooserId = 1;
let consoleSequence = 0;
const tabOperationQueue = createTabOperationQueue();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  await chrome.storage.local.set(current);
  chrome.alarms.create("bridge.keepalive", { periodInMinutes: 0.5 });
  connectNative();
});

chrome.runtime.onStartup.addListener(connectNative);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "bridge.keepalive" && !connected) connectNative();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "bridge.status") {
    sendResponse({ connected, error: lastError });
    return false;
  }
  if (message?.type === "bridge.reconnect") {
    connectNative(true);
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId != null && method === "Target.attachedToTarget" && params?.targetInfo?.type === "iframe" && params.sessionId) {
    void registerOopifSession(source.tabId, params.sessionId);
  }
  if (source.tabId != null && method === "Target.detachedFromTarget") {
    const sessions = oopifSessionsByTab.get(source.tabId);
    for (const [frameId, sessionId] of sessions || []) if (sessionId === params?.sessionId) sessions.delete(frameId);
  }
  if (source.tabId != null && method === "Page.downloadWillBegin") {
    const item = { guid: params.guid, url: params.url, suggestedFilename: params.suggestedFilename, tabId: source.tabId, startedAt: Date.now() };
    downloadsByGuid.set(params.guid, item);
    for (const resolve of downloadWaitersByTab.get(source.tabId) || []) resolve(item);
  }
  if (source.tabId != null && method === "Page.fileChooserOpened") {
    const chooser = { id: String(nextFileChooserId++), tabId: source.tabId, backendNodeId: params.backendNodeId, frameId: params.frameId, mode: params.mode, createdAt: Date.now() };
    fileChoosers.set(chooser.id, chooser);
    for (const resolve of fileChooserWaitersByTab.get(source.tabId) || []) resolve(chooser);
  }
  if (source.tabId != null && method === "Runtime.consoleAPICalled") recordConsoleLog(source.tabId, {
    level: normalizeConsoleLevel(params.type), timestamp: Number(params.timestamp) || Date.now(),
    text: summarizeConsoleArgs(params.args), url: params.stackTrace?.callFrames?.[0]?.url || ""
  });
  if (source.tabId != null && method === "Log.entryAdded") recordConsoleLog(source.tabId, {
    level: normalizeConsoleLevel(params.entry?.level), timestamp: Number(params.entry?.timestamp) || Date.now(),
    text: String(params.entry?.text || "").slice(0, 10000), url: params.entry?.url || ""
  });
  if (source.tabId != null && method === "Runtime.exceptionThrown") recordConsoleLog(source.tabId, {
    level: "error", timestamp: Number(params.timestamp) || Date.now(),
    text: String(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || "Uncaught exception").slice(0, 10000),
    url: params.exceptionDetails?.url || params.exceptionDetails?.stackTrace?.callFrames?.[0]?.url || ""
  });
  if (source.tabId != null && method === "Network.requestWillBeSent" && !["WebSocket", "EventSource"].includes(params?.type)) {
    const pending = networkRequestsByTab.get(source.tabId) || new Set();
    pending.add(params.requestId);
    networkRequestsByTab.set(source.tabId, pending);
    networkIdleSinceByTab.delete(source.tabId);
  }
  if (source.tabId != null && ["Network.loadingFinished", "Network.loadingFailed"].includes(method)) {
    const pending = networkRequestsByTab.get(source.tabId);
    pending?.delete(params?.requestId);
    if (!pending?.size) networkIdleSinceByTab.set(source.tabId, Date.now());
  }
  if (source.tabId != null && method === "Page.javascriptDialogOpening") {
    const dialog = {
      id: String(nextDialogId++),
      type: params?.type || "unknown",
      message: params?.message || "",
      url: params?.url || "",
      promptText: params?.defaultPrompt || ""
    };
    jsDialogsByTab.set(source.tabId, dialog);
    for (const resolve of dialogOpenWaitersByTab.get(source.tabId) || []) resolve(dialog);
  }
  if (source.tabId != null && method === "Page.javascriptDialogClosed") {
    const dialog = jsDialogsByTab.get(source.tabId) || null;
    jsDialogsByTab.delete(source.tabId);
    for (const resolve of dialogCloseWaitersByTab.get(source.tabId) || []) resolve(dialog);
  }
  recordEvent({ source, method, params });
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId != null) {
    debuggerController.handleDetached(source.tabId);
    oopifSessionsByTab.delete(source.tabId);
    rejectOopifWaiters(source.tabId, "The tab debugger detached before the cross-process frame became available");
  }
  recordEvent({ source, method: "Debugger.detached", params: { reason } });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabOperationQueue.cancel(tabId);
  debuggerController.forgetTab(tabId);
  monitoredDocumentsByTab.delete(tabId);
  neutralizedFrameIdsByTab.delete(tabId);
  cursorPositionsByTab.delete(tabId);
  jsDialogsByTab.delete(tabId);
  dialogOpenWaitersByTab.delete(tabId);
  dialogCloseWaitersByTab.delete(tabId);
  networkRequestsByTab.delete(tabId);
  networkIdleSinceByTab.delete(tabId);
  downloadWaitersByTab.delete(tabId);
  fileChooserWaitersByTab.delete(tabId);
  consoleLogsByTab.delete(tabId);
  oopifSessionsByTab.delete(tabId);
  rejectOopifWaiters(tabId, "The tab closed before the cross-process frame became available");
  for (const [id, chooser] of fileChoosers) if (chooser.tabId === tabId) fileChoosers.delete(id);
});
chrome.tabs.onCreated.addListener((tab) => {
  createdTabs.push({ tabId: tab.id, openerTabId: tab.openerTabId, createdAt: Date.now() });
  if (createdTabs.length > 200) createdTabs.splice(0, createdTabs.length - 200);
});
chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  tabOperationQueue.cancel(removedTabId);
  const wasControlled = controlledTabs.has(removedTabId);
  debuggerController.forgetTab(removedTabId);
  monitoredDocumentsByTab.delete(removedTabId);
  neutralizedFrameIdsByTab.delete(removedTabId);
  cursorPositionsByTab.delete(removedTabId);
  jsDialogsByTab.delete(removedTabId);
  dialogOpenWaitersByTab.delete(removedTabId);
  dialogCloseWaitersByTab.delete(removedTabId);
  networkRequestsByTab.delete(removedTabId);
  networkIdleSinceByTab.delete(removedTabId);
  downloadWaitersByTab.delete(removedTabId);
  fileChooserWaitersByTab.delete(removedTabId);
  consoleLogsByTab.delete(removedTabId);
  oopifSessionsByTab.delete(removedTabId);
  rejectOopifWaiters(removedTabId, "The tab was replaced before the cross-process frame became available");
  for (const [id, chooser] of fileChoosers) if (chooser.tabId === removedTabId) fileChoosers.delete(id);
  if (wasControlled) {
    recordEvent({ source: { tabId: removedTabId }, method: "Browser.tabReplaced", params: { addedTabId } });
  }
});
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading" && controlledTabs.has(tabId)) refreshForeignFrameMonitor(tabId);
  if (changeInfo.status === "complete" && controlledTabs.has(tabId)) recoverVirtualCursor(tabId, "tab-complete");
});
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => {
  if (frameId === 0 && controlledTabs.has(tabId)) refreshForeignFrameMonitor(tabId);
});
chrome.webNavigation.onDOMContentLoaded.addListener(({ tabId, frameId }) => {
  if (frameId === 0 && controlledTabs.has(tabId)) recoverVirtualCursor(tabId, "dom-content-loaded");
});

function connectNative(force = false) {
  if (connected && !force) return;
  if (nativePort) {
    try { nativePort.disconnect(); } catch {}
  }
  clearTimeout(reconnectTimer);
  try {
    const port = chrome.runtime.connectNative(HOST_NAME);
    nativePort = port;
    port.onMessage.addListener((message) => { void onNativeMessage(message, port); });
    port.onDisconnect.addListener(() => {
      if (nativePort !== port) return;
      connected = false;
      lastError = chrome.runtime.lastError?.message || "Native host disconnected";
      reconnectTimer = setTimeout(connectNative, 2000);
    });
    connected = true;
    lastError = "";
    port.postMessage({
      type: "hello",
      extensionId: chrome.runtime.id,
      extensionVersion: chrome.runtime.getManifest().version,
      userAgent: navigator.userAgent
    });
  } catch (error) {
    connected = false;
    lastError = error.message;
    reconnectTimer = setTimeout(connectNative, 2000);
  }
}

async function onNativeMessage(message, port = nativePort) {
  if (message?.type !== "request" || message.id == null) return;
  try {
    const result = await execute(message.method, message.params || {});
    port.postMessage({ type: "response", id: message.id, result });
  } catch (error) {
    port.postMessage({
      type: "response",
      id: message.id,
      error: {
        code: error.code || "BROWSER_ERROR",
        message: error.message || String(error),
        data: error.data
      }
    });
  }
}

async function execute(method, params) {
  const settings = await chrome.storage.local.get({ enabled: true, blockedHosts: [] });
  if (!settings.enabled) throw codedError("EXTENSION_DISABLED", "Browser control is disabled in extension settings");

  switch (method) {
    case "_bridge.resolveFramePath": {
      const tabId = await authorizedTab(params, settings);
      const context = await resolveFrameContext(tabId, params.framePath);
      return { frames: context.chain.slice(1).map(({ frameId, loaderId, url }) => ({ frameId, loaderId, url })) };
    }
    case "_bridge.inspectUnsavedWork": {
      const tabId = requireTabId(params);
      const tab = await chrome.tabs.get(tabId);
      if (!tab) throw codedError("TAB_NOT_FOUND", `Tab ${tabId} was not found`);
      const unsaved = await chrome.scripting.executeScript({ target: { tabId }, func: () => {
        const changed = [...document.querySelectorAll("input,textarea,select")].some((element) => {
          if (element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)) return element.checked !== element.defaultChecked;
          if (element instanceof HTMLSelectElement) return [...element.options].some((option) => option.selected !== option.defaultSelected);
          return "value" in element && String(element.value) !== String(element.defaultValue ?? "");
        });
        return changed;
      } }).then((results) => results[0]?.result === true).catch(() => true);
      return { unsaved };
    }
    case "_bridge.consumeCreatedTabs": {
      const openerTabId = requireTabId(params);
      const since = Number(params.since) || 0;
      const settleMs = Math.max(0, Math.min(Number(params.settleMs) || 0, 500));
      if (settleMs) await delay(settleMs);
      const matches = createdTabs.filter((entry) => entry.openerTabId === openerTabId && entry.createdAt >= since);
      for (const match of matches) createdTabs.splice(createdTabs.indexOf(match), 1);
      return { tabIds: matches.map((entry) => entry.tabId) };
    }
    case "_bridge.resolveDownloadTarget": {
      const tabId = await authorizedTab(params, settings);
      const target = await locate(tabId, params.locator, params.framePath);
      const result = await evaluateInContext(tabId, target.frameContext.contextId, `(${inspectDownloadTarget.toString()})(${JSON.stringify(params.locator)})`, true, target.frameContext.sessionId);
      if (!result?.ok) throw codedError(result?.code || "DOWNLOAD_TARGET_INVALID", result?.message || "Download target is invalid");
      return result.value;
    }
    case "browser.getInfo":
      return {
        name: "Lingee Chrome Agent Bridge",
        version: chrome.runtime.getManifest().version,
        type: "extension",
        extensionId: chrome.runtime.id,
        compatibility: { foreignFrameMonitor: "remove-after-blank-v11", debuggerState: "generation-v4", monitorDiagnostics: "counts-v2", virtualCursor: "overlay-v13", dialogHandling: "codex-lifecycle-v3", locatorQueries: "codex-read-v1", frameLocators: "isolated-world-v1", navigationWaits: "navigation-v1", highLevelLifecycle: "codex-lifecycle-v1" },
        capabilities: capabilityList()
      };
    case "browser.listTabs":
      return chrome.tabs.query(params.query || {});
    case "browser.getTab":
      return chrome.tabs.get(requireTabId(params));
    case "browser.openTab":
      await assertUrlNotBlocked(params.url || "about:blank", settings);
      return chrome.tabs.create(compact({ url: params.url || "about:blank", active: params.active !== false, windowId: params.windowId }));
    case "browser.closeTab": {
      const tabId = requireTabId(params);
      return tabOperationQueue.run(tabId, async () => {
        await chrome.tabs.remove(tabId);
        return { closed: true };
      });
    }
    case "browser.activateTab": {
      const tab = await chrome.tabs.update(requireTabId(params), { active: true });
      if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      return tab;
    }
    case "browser.claimTab": {
      const tabId = requireTabId(params);
      try {
        await assertTabNotBlocked(tabId, settings);
        await ensureDebugger(tabId);
        await sendCdp(tabId, "Log.enable", {});
        return await chrome.tabs.get(tabId);
      } catch (error) {
        const stage = error.data?.stage || "claim";
        throw codedError(error.code || "BROWSER_ERROR", `browser.claimTab/${stage}: ${error.message || String(error)}`, error.data);
      }
    }
    case "browser.detachTab": {
      const tabId = requireTabId(params);
      return tabOperationQueue.run(tabId, async () => {
        await detachDebugger(tabId);
        return { detached: true };
      });
    }
    case "browser.navigate": {
      const tabId = requireTabId(params);
      await assertUrlNotBlocked(params.url, settings);
      return tabOperationQueue.run(tabId, () => chrome.tabs.update(tabId, { url: requireString(params.url, "url") }));
    }
    case "browser.back": {
      const tabId = requireTabId(params);
      return tabOperationQueue.run(tabId, async () => {
        await assertTabNotBlocked(tabId, settings);
        await chrome.tabs.goBack(tabId);
        return { ok: true };
      });
    }
    case "browser.forward": {
      const tabId = requireTabId(params);
      return tabOperationQueue.run(tabId, async () => {
        await assertTabNotBlocked(tabId, settings);
        await chrome.tabs.goForward(tabId);
        return { ok: true };
      });
    }
    case "browser.reload": {
      const tabId = requireTabId(params);
      return tabOperationQueue.run(tabId, async () => {
        await assertTabNotBlocked(tabId, settings);
        await chrome.tabs.reload(tabId, { bypassCache: params.bypassCache === true });
        return { ok: true };
      });
    }
    case "browser.groupTabs": {
      const groupId = await chrome.tabs.group(compact({ tabIds: params.tabIds, groupId: params.groupId }));
      if (params.title != null || params.color != null || params.collapsed != null) {
        await chrome.tabGroups.update(groupId, compact({ title: params.title, color: params.color, collapsed: params.collapsed }));
      }
      return chrome.tabGroups.get(groupId);
    }
    case "browser.readText":
      return evaluateValue(await authorizedTab(params, settings), readTextExpression(params.maxChars));
    case "browser.domSnapshot":
      return evaluateValue(await authorizedTab(params, settings), domSnapshotExpression(params));
    case "browser.locatorCount":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath"]), settings), params.locator, "count", params, params.framePath);
    case "browser.locatorAllTextContents":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath", "maxResults", "maxCharsPerItem", "maxTotalChars"]), settings), params.locator, "allTextContents", params, params.framePath);
    case "browser.locatorInnerText":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath", "maxChars"]), settings), params.locator, "innerText", params, params.framePath);
    case "browser.locatorTextContent":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath", "maxChars"]), settings), params.locator, "textContent", params, params.framePath);
    case "browser.locatorGetAttribute":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath", "name", "maxChars"]), settings), params.locator, "getAttribute", { ...params, name: requireString(params.name, "name") }, params.framePath);
    case "browser.locatorIsVisible":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath"]), settings), params.locator, "isVisible", params, params.framePath);
    case "browser.locatorIsEnabled":
      return queryLocator(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath"]), settings), params.locator, "isEnabled", params, params.framePath);
    case "browser.waitFor":
      return waitForLocatorState(await authorizedTab(assertOnlyParams(params, ["tabId", "locator", "framePath", "state", "timeoutMs"]), settings), params.locator, params.framePath, params.state, params.timeoutMs);
    case "browser.waitForURL":
      return waitForUrl(await authorizedTab(assertOnlyParams(params, ["tabId", "url", "match", "waitUntil", "timeoutMs"]), settings), requireString(params.url, "url"), params);
    case "browser.waitForLoadState":
      return waitForLoadState(await authorizedTab(assertOnlyParams(params, ["tabId", "state", "timeoutMs"]), settings), params.state, params.timeoutMs);
    case "browser.expectNavigation":
      return expectNavigation(assertOnlyParams(params, ["tabId", "action", "url", "match", "waitUntil", "timeoutMs"]), settings);
    case "browser.accessibilitySnapshot":
      return sendCdp(await authorizedTab(params, settings), "Accessibility.getFullAXTree", {});
    case "browser.screenshot": {
      const tabId = await authorizedTab(params, settings);
      const result = await sendCdp(tabId, "Page.captureScreenshot", {
        format: params.format || "png",
        quality: params.quality,
        captureBeyondViewport: params.captureBeyondViewport === true,
        fromSurface: true
      });
      return { data: result.data, mimeType: params.format === "jpeg" ? "image/jpeg" : "image/png" };
    }
    case "browser.click":
      return runPointerOperation(params, settings, (tabId) => clickLocator(tabId, params.locator, params.button || "left", params.clickCount || 1, params.framePath));
    case "browser.fill":
      return runPointerOperation(params, settings, (tabId) => fillLocator(tabId, params.locator, String(params.value ?? ""), params.framePath));
    case "browser.check":
      return runPointerOperation(assertOnlyParams(params, ["tabId", "locator", "framePath"]), settings, (tabId) => setCheckedLocator(tabId, params.locator, true, params.framePath));
    case "browser.uncheck":
      return runPointerOperation(assertOnlyParams(params, ["tabId", "locator", "framePath"]), settings, (tabId) => setCheckedLocator(tabId, params.locator, false, params.framePath));
    case "browser.setChecked":
      return runPointerOperation(assertOnlyParams(params, ["tabId", "locator", "framePath", "checked"]), settings, (tabId) => setCheckedLocator(tabId, params.locator, requireBoolean(params.checked, "checked"), params.framePath));
    case "browser.selectOption":
      return runPointerOperation(assertOnlyParams(params, ["tabId", "locator", "framePath", "options"]), settings, (tabId) => selectOptionLocator(tabId, params.locator, params.options, params.framePath));
    case "browser.doubleClick":
      return runPointerOperation(assertOnlyParams(params, ["tabId", "locator", "framePath", "button"]), settings, (tabId) => doubleClickLocator(tabId, params.locator, params.button || "left", params.framePath));
    case "browser.pressSequentially":
      return runControlledOperation(assertOnlyParams(params, ["tabId", "locator", "framePath", "text", "delayMs", "timeoutMs"]), settings, (tabId) => pressSequentially(tabId, params.locator, String(params.text ?? ""), params.framePath, params.delayMs, params.timeoutMs));
    case "browser.waitForDownload":
      return waitForDownload(assertOnlyParams(params, ["tabId", "action", "timeoutMs"]), settings);
    case "browser.downloadMedia":
      return downloadMedia(assertOnlyParams(params, ["tabId", "locator", "framePath", "timeoutMs"]), settings);
    case "browser.waitForFileChooser":
      return waitForFileChooser(assertOnlyParams(params, ["tabId", "action", "timeoutMs"]), settings);
    case "browser.setFileChooserFiles":
      return runControlledOperation(assertOnlyParams(params, ["tabId", "chooserId", "files"]), settings, (tabId) => setFileChooserFiles(tabId, params.chooserId, params.files));
    case "browser.press":
      return runControlledOperation(params, settings, async (tabId) => {
        if (params.framePath && !params.locator) throw codedError("INVALID_PARAMS", "framePath requires locator for browser.press");
        if (params.locator) {
          const target = await locate(tabId, params.locator, params.framePath);
          await clickCoordinates(tabId, target.x, target.y, "left", 1, target.frameContext);
        }
        return pressKey(tabId, requireString(params.key, "key"), params.modifiers || []);
      });
    case "browser.type":
      return runControlledOperation(params, settings, async (tabId) => {
        if (params.framePath && !params.locator) throw codedError("INVALID_PARAMS", "framePath requires locator for browser.type");
        if (params.locator) {
          const target = await locate(tabId, params.locator, params.framePath);
          await clickCoordinates(tabId, target.x, target.y, "left", 1, target.frameContext);
        }
        await sendCdp(tabId, "Input.insertText", { text: String(params.text ?? "") });
        return { typed: true, length: String(params.text ?? "").length };
      });
    case "browser.mouseMove": {
      const x = number(params.x, 0); const y = number(params.y, 0);
      return runPointerOperation(params, settings, async (tabId) => {
        await moveVirtualCursor(tabId, x, y);
        return { x, y };
      });
    }
    case "browser.coordinateClick": {
      const x = number(params.x, 0); const y = number(params.y, 0); const button = params.button || "left"; const clickCount = Number(params.clickCount) || 1;
      return runPointerOperation(params, settings, async (tabId) => {
        const click = await clickCoordinates(tabId, x, y, button, clickCount);
        return { x, y, button, clickCount, ...click };
      });
    }
    case "browser.drag":
      return runPointerOperation(params, settings, (tabId) => drag(tabId, params));
    case "browser.wheel": {
      const x = number(params.x, 0); const y = number(params.y, 0);
      return runPointerOperation(params, settings, async (tabId) => {
        const movement = await moveVirtualCursor(tabId, x, y);
        const deltaY = number(params.deltaY, 0);
        await requireVirtualCursor(tabId, x, y, "wheel", { deltaY, waitForPaint: true }, movement.documentId);
        await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: number(params.deltaX, 0), deltaY, button: "none" }, movement.documentId);
        await waitForCursorMotion(WHEEL_FEEDBACK_MIN_MS);
        return { ok: true };
      });
    }
    case "browser.scroll": {
      return runPointerOperation(params, settings, async (tabId) => {
        const previous = cursorPositionsByTab.get(tabId);
        const deltaY = number(params.deltaY, 0);
        const rendered = await requireVirtualCursor(tabId, previous?.x, previous?.y, "wheel", { deltaY, waitForPaint: true }, previous?.documentId);
        const result = await evaluateAttachedValue(tabId, `(() => { window.scrollBy(${number(params.deltaX, 0)}, ${deltaY}); return {x: window.scrollX, y: window.scrollY}; })()`, rendered.documentId);
        await waitForCursorMotion(WHEEL_FEEDBACK_MIN_MS);
        return result;
      });
    }
    case "browser.setFileInput":
      return runControlledOperation(params, settings, (tabId) => setFileInput(tabId, requireString(params.selector, "selector"), params.files, params.framePath));
    case "browser.getDialog": {
      const tabId = await controlledDialogTab(params, settings);
      return jsDialogsByTab.get(tabId) || null;
    }
    case "browser.handleDialog":
      return handleJavaScriptDialog(params, settings);
    case "browser.cdp":
      return sendCdp(await authorizedTab(params, settings), requireString(params.command, "command"), params.params || {});
    case "browser.getEvents":
      return getEvents(params);
    case "browser.getConsoleLogs":
      return getConsoleLogs(await authorizedTab(assertOnlyParams(params, ["tabId", "afterSequence", "limit", "levels", "text"]), settings), params);
    case "browser.historySearch":
      return chrome.history.search({ text: params.text || "", startTime: params.startTime, endTime: params.endTime, maxResults: params.maxResults || 100 });
    case "browser.bookmarkSearch":
      return chrome.bookmarks.search(params.query || params.text || "");
    case "browser.downloadsSearch":
      return chrome.downloads.search(params.query || {});
    default:
      throw codedError("METHOD_NOT_FOUND", `Unknown browser method: ${method}`);
  }
}

async function authorizedTab(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  await ensureDebugger(tabId);
  return tabId;
}

async function controlledDialogTab(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  if (!controlledTabs.has(tabId) || !attachedTabs.has(tabId)) {
    throw codedError("POINTER_CONTROL_LOST", "The tab is not under debugger control for JavaScript dialog handling");
  }
  return tabId;
}

async function handleJavaScriptDialog(params, settings) {
  const tabId = await controlledDialogTab(params, settings);
  const dialog = jsDialogsByTab.get(tabId);
  if (!dialog) throw codedError("JAVASCRIPT_DIALOG_NOT_FOUND", "No active JavaScript dialog is registered for this tab");
  if (params.dialogId != null && String(params.dialogId) !== dialog.id) {
    throw codedError("JAVASCRIPT_DIALOG_CHANGED", "The active JavaScript dialog changed before it could be handled", {
      expectedDialogId: String(params.dialogId),
      actualDialogId: dialog.id
    });
  }

  const accept = dialog.type === "alert" ? true : params.accept !== false;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const waiters = dialogCloseWaitersByTab.get(tabId) || new Set();
  waiters.add(resolveClosed);
  dialogCloseWaitersByTab.set(tabId, waiters);

  // A modal dialog blocks cursor recovery/page injection. Send directly to the
  // already attached target, as Codex Browser Use does for its dialog object.
  const command = chrome.debugger.sendCommand({ tabId }, "Page.handleJavaScriptDialog", compact({
    accept,
    promptText: dialog.type === "prompt" && accept ? String(params.promptText ?? "") : undefined
  }));
  try {
    await Promise.race([closed, command.then(() => closed)]);
    return { ok: true, dialog };
  } finally {
    waiters.delete(resolveClosed);
    if (waiters.size === 0) dialogCloseWaitersByTab.delete(tabId);
    command.catch(() => {});
  }
}

function runPointerOperation(params, settings, operation) {
  return runControlledOperation(params, settings, operation);
}

function runControlledOperation(params, settings, operation) {
  const tabId = requireTabId(params);
  return tabOperationQueue.run(tabId, async () => {
    await assertTabNotBlocked(tabId, settings);
    await ensureDebugger(tabId);
    return operation(tabId);
  });
}

async function ensureDebugger(tabId) {
  const result = await debuggerController.ensure(tabId);
  if (controlledTabs.has(tabId)) await recoverVirtualCursor(tabId, "control-start");
  return result;
}

async function detachDebugger(tabId) {
  try {
    if (attachedTabs.has(tabId)) {
      await boundedCleanup(chrome.debugger.sendCommand({ tabId }, "Target.setAutoAttach", {
        autoAttach: false,
        waitForDebuggerOnStart: false,
        flatten: true
      }), 1500).catch(() => {});
    }
    return await debuggerController.detach(tabId);
  } finally {
    cursorPositionsByTab.delete(tabId);
    oopifSessionsByTab.delete(tabId);
    rejectOopifWaiters(tabId, "The tab debugger detached before the cross-process frame became available");
  }
}

function boundedCleanup(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(codedError("CLEANUP_TIMEOUT", `Browser cleanup exceeded ${timeoutMs}ms`)), timeoutMs))
  ]);
}

function boundedBrowserCall(promise, timeoutMs, code, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(codedError(code, message)), timeoutMs))
  ]);
}

async function installForeignFrameMonitorInTab(tabId) {
  const installed = monitoredDocumentsByTab.get(tabId) || new Set();
  const neutralizedFrameIds = neutralizedFrameIdsByTab.get(tabId) || new Set();
  monitoredDocumentsByTab.set(tabId, installed);
  neutralizedFrameIdsByTab.set(tabId, neutralizedFrameIds);
  const getTrackedFrames = async (target) => {
    const frames = await chrome.webNavigation.getAllFrames(target) || [];
    for (const frame of frames) {
      if (isForeignExtensionUrl(frame.url)) neutralizedFrameIds.add(frame.frameId);
    }
    expandFrameIdSubtree(frames, neutralizedFrameIds);
    return frames;
  };
  await installMonitorsForTab({
    tabId,
    installed,
    getAllFrames: getTrackedFrames,
    isInjectableFrame: (frame) => isMonitorablePageFrame(frame, chrome.runtime.id, neutralizedFrameIds),
    executeMonitor: executeForeignFrameMonitor
  });
  await waitForForeignExtensionFramesToClear(tabId);
}

async function removeForeignFrameMonitorFromTab(tabId) {
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const documentIds = (frames || [])
      .filter((frame) => frame.documentId && !frame.errorOccurred && !isForeignExtensionUrl(frame.url))
      .map((frame) => frame.documentId);
    if (documentIds.length === 0) return;
    await chrome.scripting.executeScript({
      target: { tabId, documentIds: [...new Set(documentIds)] },
      func: removeForeignFrameMonitor,
      args: [FOREIGN_FRAME_MONITOR_KEY],
      injectImmediately: true
    });
  } catch {
  } finally {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: removeVirtualCursor,
        args: [VIRTUAL_CURSOR_KEY],
        injectImmediately: true
      });
    } catch {}
    monitoredDocumentsByTab.delete(tabId);
    neutralizedFrameIdsByTab.delete(tabId);
  }
}

async function readMonitorDiagnosticsInTab(tabId) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId }) || [];
  const pageFrames = frames.filter(isInjectableFrame);
  const documents = [];
  for (const frame of pageFrames) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId, documentIds: [frame.documentId] },
        func: readForeignFrameMonitorDiagnostics,
        args: [FOREIGN_FRAME_MONITOR_KEY]
      });
      documents.push(...results.map(({ result }) => result));
    } catch { documents.push({ diagnosticUnavailable: true }); }
  }
  return { pageFrameCount: pageFrames.length,
    foreignFrameCount: frames.filter((frame) => isForeignExtensionUrl(frame.url)).length,
    documents };
}

function executeForeignFrameMonitor(target) {
  return chrome.scripting.executeScript({
    target,
    func: installForeignFrameMonitor,
    args: [FOREIGN_FRAME_MONITOR_KEY, chrome.runtime.id],
    injectImmediately: true
  });
}

function isForeignExtensionUrl(value) {
  if (typeof value !== "string" || !value.startsWith("chrome-extension://")) return false;
  try {
    const url = new URL(value);
    return url.hostname.length > 0 && url.hostname !== chrome.runtime.id;
  } catch {
    return false;
  }
}

function isInjectableFrame(frame) {
  return isMonitorablePageFrame(frame, chrome.runtime.id, neutralizedFrameIdsByTab.get(frame?.tabId));
}

async function waitForForeignExtensionFramesToClear(tabId, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  let consecutiveClearChecks = 0;
  while (Date.now() < deadline) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId });
    const neutralizedFrameIds = neutralizedFrameIdsByTab.get(tabId) || new Set();
    const activeFrameIds = new Set((frames || []).map((frame) => frame.frameId));
    const hasPendingNeutralizedFrame = [...neutralizedFrameIds].some((frameId) => activeFrameIds.has(frameId));
    if (!(frames || []).some((frame) => isForeignExtensionUrl(frame.url)) && !hasPendingNeutralizedFrame) {
      consecutiveClearChecks += 1;
      if (consecutiveClearChecks >= 3) {
        neutralizedFrameIds.clear();
        return;
      }
    } else {
      consecutiveClearChecks = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw codedError("FOREIGN_FRAME_MONITOR_FAILED", "A foreign extension frame did not become inert before debugger attachment");
}

function refreshForeignFrameMonitor(tabId) {
  debuggerController.refresh(tabId)
    .then(() => recoverVirtualCursor(tabId, "navigation-refresh"))
    .catch((error) => {
      recordEvent({ source: { tabId }, method: "Bridge.foreignFrameMonitorFailed", params: { message: error.message || String(error) } });
    });
}

async function recoverVirtualCursor(tabId, reason) {
  for (const delayMs of CURSOR_RECOVERY_DELAYS_MS) {
    if (!controlledTabs.has(tabId)) return false;
    if (delayMs > 0) await waitForCursorMotion(delayMs);
    if (!controlledTabs.has(tabId)) return false;
    const rendered = await showVirtualCursor(tabId, null, null, "ensure");
    if (rendered?.visible) return true;
  }
  recordEvent({ source: { tabId }, method: "Bridge.virtualCursorUnavailable", params: { reason } });
  return false;
}

async function sendCdp(tabId, method, params = {}) {
  await ensureDebugger(tabId);
  return chrome.debugger.sendCommand({ tabId }, method, compact(params));
}

async function sendCdpInSession(tabId, sessionId, method, params = {}) {
  await ensureDebugger(tabId);
  return chrome.debugger.sendCommand(sessionId ? { tabId, sessionId } : { tabId }, method, compact(params));
}

async function getOopifSession(tabId, frameId) {
  const sessions = oopifSessionsByTab.get(tabId) || new Map();
  oopifSessionsByTab.set(tabId, sessions);
  const existing = sessions.get(frameId);
  if (existing) {
    try {
      const { frameTree } = await sendCdpInSession(tabId, existing, "Page.getFrameTree", {});
      if (frameTree?.frame?.id === frameId) return existing;
    } catch {}
    sessions.delete(frameId);
  }
  try {
    await sendCdp(tabId, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: "iframe", exclude: false }]
    });
    return await waitForOopifSession(tabId, frameId);
  } catch (error) {
    throw codedError("FRAME_INACCESSIBLE", "The cross-process frame target could not be auto-attached", { frameId, reason: String(error?.message || error).slice(0, 300) });
  }
}

async function registerOopifSession(tabId, sessionId) {
  try {
    const { frameTree } = await chrome.debugger.sendCommand({ tabId, sessionId }, "Page.getFrameTree", {});
    const frameId = frameTree?.frame?.id;
    if (!frameId) return;
    const sessions = oopifSessionsByTab.get(tabId) || new Map();
    sessions.set(frameId, sessionId);
    oopifSessionsByTab.set(tabId, sessions);
    const waiter = oopifSessionWaitersByTab.get(tabId)?.get(frameId);
    if (waiter) waiter.resolve(sessionId);
    await chrome.debugger.sendCommand({ tabId, sessionId }, "Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
      filter: [{ type: "iframe", exclude: false }]
    });
  } catch {}
}

function waitForOopifSession(tabId, frameId, timeoutMs = 2000) {
  const existing = oopifSessionsByTab.get(tabId)?.get(frameId);
  if (existing) return Promise.resolve(existing);
  const waiters = oopifSessionWaitersByTab.get(tabId) || new Map();
  oopifSessionWaitersByTab.set(tabId, waiters);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(frameId);
      if (!waiters.size) oopifSessionWaitersByTab.delete(tabId);
      reject(codedError("FRAME_INACCESSIBLE", "Timed out waiting for the cross-process frame debugger session", { frameId }));
    }, timeoutMs);
    waiters.set(frameId, {
      resolve: (sessionId) => {
        clearTimeout(timer);
        waiters.delete(frameId);
        if (!waiters.size) oopifSessionWaitersByTab.delete(tabId);
        resolve(sessionId);
      },
      reject: (error) => {
        clearTimeout(timer);
        waiters.delete(frameId);
        if (!waiters.size) oopifSessionWaitersByTab.delete(tabId);
        reject(error);
      }
    });
  });
}

function rejectOopifWaiters(tabId, message) {
  const waiters = oopifSessionWaitersByTab.get(tabId);
  if (!waiters) return;
  for (const { reject } of waiters.values()) reject(codedError("FRAME_INACCESSIBLE", message));
  oopifSessionWaitersByTab.delete(tabId);
}

async function showVirtualCursor(tabId, x, y, phase, details = {}) {
  try {
    const previous = cursorPositionsByTab.get(tabId);
    const effectiveX = x == null && previous ? previous.x : x;
    const effectiveY = y == null && previous ? previous.y : y;
    const results = await boundedBrowserCall(chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: renderVirtualCursor,
      args: [VIRTUAL_CURSOR_KEY, effectiveX, effectiveY, phase, details, chrome.runtime.getURL("icons/lingee-48.png")],
      injectImmediately: true
    }), 2500, "CURSOR_RENDER_TIMEOUT", "Virtual cursor rendering timed out");
    const rendered = results?.[0]?.result;
    if (Number.isFinite(rendered?.x) && Number.isFinite(rendered?.y)) {
      cursorPositionsByTab.set(tabId, { x: rendered.x, y: rendered.y, documentId: results?.[0]?.documentId });
    }
    return rendered ? { ...rendered, documentId: results?.[0]?.documentId } : rendered;
  } catch {
    // Recovery probes may fail on restricted or transient documents. Required pointer paths fail closed in requireVirtualCursor.
    return null;
  }
}

async function requireVirtualCursor(tabId, x, y, phase, details = {}, expectedDocumentId) {
  const rendered = await showVirtualCursor(tabId, x, y, phase, details);
  if (!rendered?.visible || rendered.topLayer !== true || !rendered.documentId) {
    throw codedError("CURSOR_RENDER_FAILED", `Virtual cursor ${phase} feedback could not be rendered; browser input was not dispatched`, { tabId, phase });
  }
  if (expectedDocumentId && rendered.documentId !== expectedDocumentId) {
    throw codedError("CURSOR_DOCUMENT_CHANGED", "The page changed while synchronizing virtual cursor feedback; browser input was not dispatched", {
      tabId,
      phase,
      expectedDocumentId,
      actualDocumentId: rendered.documentId
    });
  }
  if ((x != null && Math.abs(rendered.x - x) > 1) || (y != null && Math.abs(rendered.y - y) > 1)) {
    throw codedError("CURSOR_POSITION_MISMATCH", "Virtual cursor feedback did not reach the requested coordinates; browser input was not dispatched", { tabId, phase, x, y, renderedX: rendered.x, renderedY: rendered.y });
  }
  return rendered;
}

function cursorMotionDuration(tabId, x, y) {
  const previous = cursorPositionsByTab.get(tabId);
  if (!previous) return CURSOR_MIN_MOTION_MS;
  const distance = Math.hypot(x - previous.x, y - previous.y);
  if (distance < 4) return 0;
  return Math.round(Math.min(CURSOR_MAX_MOTION_MS, Math.max(CURSOR_MIN_MOTION_MS, 140 + distance * 0.3)));
}

async function moveVirtualCursor(tabId, x, y) {
  const duration = cursorMotionDuration(tabId, x, y);
  const started = await requireVirtualCursor(tabId, x, y, "move", { motionDurationMs: duration, waitForPaint: true });
  if (duration > 0) await waitForCursorMotion(duration + CURSOR_SETTLE_MS);
  await requireVirtualCursor(tabId, x, y, "ensure", { waitForPaint: true }, started.documentId);
  await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" }, started.documentId);
  return { duration, documentId: started.documentId };
}

function waitForCursorMotion(duration = CURSOR_SETTLE_MS) {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function evaluateValue(tabId, expression) {
  const response = await sendCdp(tabId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false
  });
  if (response.exceptionDetails) throw codedError("PAGE_EVALUATION_FAILED", response.exceptionDetails.text || "Page evaluation failed");
  return response.result?.value;
}

async function evaluateInContext(tabId, contextId, expression, returnByValue = true, sessionId = null) {
  const response = await sendCdpInSession(tabId, sessionId, "Runtime.evaluate", {
    contextId,
    expression,
    awaitPromise: true,
    returnByValue,
    userGesture: false
  });
  if (response.exceptionDetails) throwPageException(response.exceptionDetails);
  return returnByValue ? response.result?.value : response.result;
}

function throwPageException(details) {
  const description = details.exception?.description || details.text || "Page evaluation failed";
  const marker = description.match(/LINGEE_FRAME:(\{[^\n]+\})/);
  if (marker) {
    try {
      const failure = JSON.parse(marker[1]);
      throw codedError(failure.code || "FRAME_INACCESSIBLE", failure.message || "Frame resolution failed", failure.data);
    } catch (error) {
      if (error?.code) throw error;
    }
  }
  throw codedError("PAGE_EVALUATION_FAILED", details.text || description);
}

async function resolveFrameContext(tabId, framePath, scrollFrames = true) {
  const path = validateFramePath(framePath);
  const topDocument = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
  const { frameTree } = await sendCdp(tabId, "Page.getFrameTree", {});
  let current = frameTree.frame;
  let sessionId = null;
  let offsetX = 0;
  let offsetY = 0;
  const chain = [{ frameId: current.id, loaderId: current.loaderId, url: current.url, sessionId }];
  for (let index = 0; index < path.length; index += 1) {
    const ownerSessionId = sessionId;
    let context;
    try {
      context = await sendCdpInSession(tabId, ownerSessionId, "Page.createIsolatedWorld", { frameId: current.id, worldName: FRAME_WORLD_NAME, grantUniveralAccess: false });
    } catch (error) {
      throw codedError("FRAME_INACCESSIBLE", `Frame at path index ${index} cannot create an isolated execution context`, { index });
    }
    const remote = await evaluateInContext(tabId, context.executionContextId, `(${resolveFrameElement.toString()})(${JSON.stringify(path[index])})`, false, ownerSessionId);
    if (!remote?.objectId) throw codedError("FRAME_NOT_FOUND", `Frame at path index ${index} did not resolve to a frame element`, { index });
    try {
      const [described, geometry] = await Promise.all([
        sendCdpInSession(tabId, ownerSessionId, "DOM.describeNode", { objectId: remote.objectId, depth: 0 }),
        sendCdpInSession(tabId, ownerSessionId, "Runtime.callFunctionOn", {
          objectId: remote.objectId,
          functionDeclaration: scrollFrames
            ? "function(){this.scrollIntoView({block:'center',inline:'center',behavior:'instant'});const r=this.getBoundingClientRect();return {left:r.left,top:r.top,clientLeft:this.clientLeft||0,clientTop:this.clientTop||0};}"
            : "function(){const r=this.getBoundingClientRect();return {left:r.left,top:r.top,clientLeft:this.clientLeft||0,clientTop:this.clientTop||0};}",
          returnByValue: true
        })
      ]);
      const childFrameId = described.node?.frameId;
      const { frameTree: latestFrameTree } = await sendCdpInSession(tabId, ownerSessionId, "Page.getFrameTree", {});
      let child = flattenFrameTree(latestFrameTree).get(childFrameId);
      let childSessionId = ownerSessionId;
      if (!child) {
        childSessionId = await getOopifSession(tabId, childFrameId);
        const { frameTree: childFrameTree } = await sendCdpInSession(tabId, childSessionId, "Page.getFrameTree", {});
        child = childFrameTree?.frame?.id === childFrameId ? childFrameTree.frame : null;
      } else if (child.parentId !== current.id) {
        throw codedError("FRAME_INACCESSIBLE", `Resolved frame at path index ${index} is attached to a different parent`, { index });
      }
      if (!child) throw codedError("FRAME_INACCESSIBLE", `Resolved frame at path index ${index} is unavailable or changed`, { index });
      const rect = geometry.result?.value;
      if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)) throw codedError("FRAME_INACCESSIBLE", `Frame geometry at path index ${index} is unavailable`, { index });
      offsetX += rect.left + (Number(rect.clientLeft) || 0);
      offsetY += rect.top + (Number(rect.clientTop) || 0);
      current = child;
      sessionId = childSessionId;
      chain.push({ frameId: current.id, loaderId: current.loaderId, url: current.url, sessionId });
    } finally {
      await sendCdpInSession(tabId, ownerSessionId, "Runtime.releaseObject", { objectId: remote.objectId }).catch(() => {});
    }
  }
  let context;
  try {
    context = await sendCdpInSession(tabId, sessionId, "Page.createIsolatedWorld", { frameId: current.id, worldName: FRAME_WORLD_NAME, grantUniveralAccess: false });
  } catch {
    throw codedError("FRAME_INACCESSIBLE", "The target frame cannot create an isolated execution context");
  }
  return { contextId: context.executionContextId, frameId: current.id, loaderId: current.loaderId, sessionId, offsetX, offsetY, chain, topDocumentId: topDocument?.documentId };
}

function flattenFrameTree(root, result = new Map()) {
  if (!root?.frame) return result;
  result.set(root.frame.id, root.frame);
  for (const child of root.childFrames || []) flattenFrameTree(child, result);
  return result;
}

async function assertFrameContextFresh(tabId, context) {
  if (!context?.chain?.length) return;
  for (const expected of context.chain) {
    let frameTree;
    try {
      ({ frameTree } = await sendCdpInSession(tabId, expected.sessionId, "Page.getFrameTree", {}));
    } catch {
      throw codedError("FRAME_CONTEXT_CHANGED", "A frame debugger session changed before the operation could complete", { frameId: expected.frameId });
    }
    const frames = flattenFrameTree(frameTree);
    const actual = frames.get(expected.frameId);
    if (!actual || actual.loaderId !== expected.loaderId) {
      throw codedError("FRAME_CONTEXT_CHANGED", "A frame document changed before the operation could complete", { frameId: expected.frameId });
    }
  }
}

async function sendPointerCdp(tabId, method, params = {}, expectedDocumentId) {
  if (!controlledTabs.has(tabId)) throw codedError("POINTER_CONTROL_LOST", `Tab ${tabId} is no longer controlled`);
  if (expectedDocumentId) await assertPointerDocument(tabId, expectedDocumentId);
  return chrome.debugger.sendCommand({ tabId }, method, compact(params));
}

async function assertPointerDocument(tabId, expectedDocumentId) {
  const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
  if (!frame?.documentId || frame.documentId !== expectedDocumentId) {
    throw codedError("CURSOR_DOCUMENT_CHANGED", "The page changed before synchronized browser input could be dispatched", {
      tabId,
      expectedDocumentId,
      actualDocumentId: frame?.documentId
    });
  }
}

async function evaluateAttachedValue(tabId, expression, expectedDocumentId) {
  const response = await sendPointerCdp(tabId, "Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false
  }, expectedDocumentId);
  if (response.exceptionDetails) throw codedError("PAGE_EVALUATION_FAILED", response.exceptionDetails.text || "Page evaluation failed");
  return response.result?.value;
}

async function clickLocator(tabId, locator, button, clickCount, framePath) {
  const target = await locate(tabId, locator, framePath);
  const click = await clickCoordinates(tabId, target.x, target.y, button, clickCount, target.frameContext);
  const { frameContext: _context, ...publicTarget } = target;
  return { ...publicTarget, ...click };
}

async function clickCoordinates(tabId, x, y, button, clickCount, frameContext) {
  await assertFrameContextFresh(tabId, frameContext);
  const movement = await moveVirtualCursor(tabId, x, y);
  await assertFrameContextFresh(tabId, frameContext);
  await requireVirtualCursor(tabId, x, y, "pressed", { waitForPaint: true }, movement.documentId);
  let pressed = false;
  try {
    await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x, y, button, buttons: mouseButtonMask(button), clickCount }, movement.documentId);
    pressed = true;
    await waitForCursorMotion(CURSOR_PRESS_HOLD_MS);
    await assertFrameContextFresh(tabId, frameContext);
    const release = await dispatchMouseReleaseOrDialog(tabId, { type: "mouseReleased", x, y, button, buttons: 0, clickCount }, movement.documentId);
    pressed = false;
    if (release.dialogOpened) return release;
  } finally {
    if (pressed) {
      await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button, buttons: 0, clickCount }).catch(() => {});
    }
  }
  try {
    await requireVirtualCursor(tabId, x, y, "click", { waitForPaint: true }, movement.documentId);
    await waitForCursorMotion(CLICK_FEEDBACK_MS);
    return { dialogOpened: false };
  } catch (error) {
    const frame = await chrome.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
    if (frame?.documentId && frame.documentId !== movement.documentId) {
      void recoverVirtualCursor(tabId, "post-click-navigation");
      return { dialogOpened: false, navigationStarted: true };
    }
    throw error;
  }
}

async function doubleClickLocator(tabId, locator, button, framePath) {
  if (!["left", "middle", "right"].includes(button)) throw codedError("INVALID_PARAMS", "button must be left, middle, or right");
  const target = await locate(tabId, locator, framePath);
  await assertFrameContextFresh(tabId, target.frameContext);
  const movement = await moveVirtualCursor(tabId, target.x, target.y);
  for (const clickCount of [1, 2]) {
    await assertFrameContextFresh(tabId, target.frameContext);
    await requireVirtualCursor(tabId, target.x, target.y, "pressed", { waitForPaint: true }, movement.documentId);
    await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button, buttons: mouseButtonMask(button), clickCount }, movement.documentId);
    await waitForCursorMotion(50);
    await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button, buttons: 0, clickCount }, movement.documentId);
    if (clickCount === 1) await waitForCursorMotion(70);
  }
  await requireVirtualCursor(tabId, target.x, target.y, "click", { doubleClick: true, waitForPaint: true }, movement.documentId);
  await waitForCursorMotion(CLICK_FEEDBACK_MS);
  return { x: target.x, y: target.y, button, clickCount: 2, doubleClicked: true };
}

async function dispatchMouseReleaseOrDialog(tabId, params, expectedDocumentId) {
  let resolveDialog;
  const dialogOpened = new Promise((resolve) => { resolveDialog = resolve; });
  const waiters = dialogOpenWaitersByTab.get(tabId) || new Set();
  waiters.add(resolveDialog);
  dialogOpenWaitersByTab.set(tabId, waiters);
  if (jsDialogsByTab.has(tabId)) resolveDialog(jsDialogsByTab.get(tabId));
  const command = sendPointerCdp(tabId, "Input.dispatchMouseEvent", params, expectedDocumentId);
  try {
    const outcome = await Promise.race([
      command.then(() => ({ dialogOpened: false })),
      dialogOpened.then((dialog) => ({ dialogOpened: true, dialog }))
    ]);
    if (outcome.dialogOpened) command.catch(() => {});
    return outcome;
  } finally {
    waiters.delete(resolveDialog);
    if (waiters.size === 0) dialogOpenWaitersByTab.delete(tabId);
  }
}

function mouseButtonMask(button) {
  return { left: 1, right: 2, middle: 4, back: 8, forward: 16 }[button] || 0;
}

async function fillLocator(tabId, locator, value, framePath) {
  const target = await locate(tabId, locator, framePath);
  await clickCoordinates(tabId, target.x, target.y, "left", 1, target.frameContext);
  await assertFrameContextFresh(tabId, target.frameContext);
  await sendPointerCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 });
  await sendPointerCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 });
  await sendPointerCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace" });
  await sendPointerCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace" });
  if (value) await sendPointerCdp(tabId, "Input.insertText", { text: value });
  const { frameContext: _context, ...publicTarget } = target;
  return { ...publicTarget, filled: true };
}

async function setCheckedLocator(tabId, locator, checked, framePath) {
  const target = await locate(tabId, locator, framePath);
  const before = await inspectControl(tabId, target.frameContext, locator);
  if (!before.visible || !before.enabled) throw codedError("CONTROL_NOT_INTERACTABLE", "Checkbox or radio must be visible and enabled");
  if (!["checkbox", "radio"].includes(before.type)) throw codedError("CONTROL_TYPE_MISMATCH", "browser.setChecked requires a checkbox or radio input", { type: before.type });
  if (before.type === "radio" && checked === false) throw codedError("CONTROL_TYPE_MISMATCH", "Radio inputs cannot be unchecked directly");
  if (before.checked !== checked) await clickCoordinates(tabId, target.x, target.y, "left", 1, target.frameContext);
  const after = await inspectControl(tabId, target.frameContext, locator);
  if (after.checked !== checked) throw codedError("CONTROL_STATE_MISMATCH", "The control did not reach the requested checked state", { expected: checked, actual: after.checked });
  return { checked: after.checked, changed: before.checked !== after.checked, type: after.type };
}

async function selectOptionLocator(tabId, locator, selections, framePath) {
  const normalized = normalizeSelections(selections);
  const target = await locate(tabId, locator, framePath);
  const before = await inspectControl(tabId, target.frameContext, locator);
  if (!before.visible || !before.enabled) throw codedError("CONTROL_NOT_INTERACTABLE", "Select must be visible and enabled");
  if (before.tagName !== "SELECT") throw codedError("CONTROL_TYPE_MISMATCH", "browser.selectOption requires a native select element", { tagName: before.tagName });
  if (!before.multiple && normalized.length > 1) throw codedError("CONTROL_TYPE_MISMATCH", "A single-select control accepts only one option");
  await moveVirtualCursor(tabId, target.x, target.y);
  await assertFrameContextFresh(tabId, target.frameContext);
  const result = await evaluateInContext(tabId, target.frameContext.contextId, `(${applySelectOptions.toString()})(${JSON.stringify(locator)}, ${JSON.stringify(normalized)})`, true, target.frameContext.sessionId);
  if (!result?.ok) throw codedError(result?.code || "CONTROL_STATE_MISMATCH", result?.message || "Option selection failed", result?.data);
  const after = await inspectControl(tabId, target.frameContext, locator);
  if (JSON.stringify(after.selectedValues) !== JSON.stringify(result.values)) throw codedError("CONTROL_STATE_MISMATCH", "Select value verification failed");
  return { values: after.selectedValues, labels: after.selectedLabels, multiple: after.multiple };
}

async function pressSequentially(tabId, locator, text, framePath, delayMs, timeoutMs) {
  const delayPerCharacter = delayMs == null ? 40 : Number(delayMs);
  if (!Number.isInteger(delayPerCharacter) || delayPerCharacter < 0 || delayPerCharacter > 1000) throw codedError("INVALID_PARAMS", "delayMs must be an integer between 0 and 1000");
  const timeout = boundedTimeout(timeoutMs, 30000);
  if (text.length > 10000) throw codedError("INVALID_PARAMS", "text cannot exceed 10000 characters");
  const target = await locate(tabId, locator, framePath);
  const before = await inspectControl(tabId, target.frameContext, locator);
  if (!before.visible || !before.enabled || !before.editable) throw codedError("CONTROL_NOT_INTERACTABLE", "Sequential input requires a visible enabled editable control");
  await clickCoordinates(tabId, target.x, target.y, "left", 1, target.frameContext);
  const started = Date.now();
  let typedLength = 0;
  for (const character of text) {
    if (Date.now() - started + delayPerCharacter > timeout) throw codedError("INPUT_TIMEOUT", `Sequential input exceeded ${timeout}ms`, { typedLength });
    await assertFrameContextFresh(tabId, target.frameContext);
    await sendPointerCdp(tabId, "Input.insertText", { text: character });
    typedLength += character.length;
    if (delayPerCharacter) await delay(delayPerCharacter);
  }
  const after = await inspectControl(tabId, target.frameContext, locator);
  if (typeof after.value !== "string" || !after.value.endsWith(text)) throw codedError("CONTROL_STATE_MISMATCH", "Sequential input final value verification failed");
  return { typed: true, length: text.length, valueLength: after.value.length, elapsedMs: Date.now() - started };
}

async function inspectControl(tabId, frameContext, locator) {
  const result = await evaluateInContext(tabId, frameContext.contextId, `(${inspectLocatedControl.toString()})(${JSON.stringify(locator)})`, true, frameContext.sessionId);
  if (!result?.ok) throw codedError(result?.code || "LOCATOR_NOT_FOUND", result?.message || "Control inspection failed", result?.data);
  return result.value;
}

async function drag(tabId, params) {
  const from = params.from?.locator ? await locate(tabId, params.from.locator, params.from.framePath) : { x: number(params.from?.x, 0), y: number(params.from?.y, 0) };
  const to = params.to?.locator ? await locate(tabId, params.to.locator, params.to.framePath) : { x: number(params.to?.x, 0), y: number(params.to?.y, 0) };
  const steps = Math.max(2, Math.min(Number(params.steps) || 12, 60));
  const movement = await moveVirtualCursor(tabId, from.x, from.y);
  await assertFrameContextFresh(tabId, from.frameContext);
  await assertFrameContextFresh(tabId, to.frameContext);
  await requireVirtualCursor(tabId, from.x, from.y, "pressed", { drag: true, originX: from.x, originY: from.y, waitForPaint: true }, movement.documentId);
  let pressed = false;
  let current = { x: from.x, y: from.y };
  try {
    await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 }, movement.documentId);
    pressed = true;
    for (let index = 1; index <= steps; index += 1) {
      const ratio = index / steps;
      current = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio };
      await assertFrameContextFresh(tabId, from.frameContext);
      await assertFrameContextFresh(tabId, to.frameContext);
      await requireVirtualCursor(tabId, current.x, current.y, "pressed", { drag: true, originX: from.x, originY: from.y, waitForPaint: true }, movement.documentId);
      await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseMoved", x: current.x, y: current.y, button: "left", buttons: 1 }, movement.documentId);
      await waitForCursorMotion(DRAG_FRAME_MS);
    }
    await waitForCursorMotion(CURSOR_SETTLE_MS);
    await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 }, movement.documentId);
    pressed = false;
  } finally {
    if (pressed) {
      await sendPointerCdp(tabId, "Input.dispatchMouseEvent", { type: "mouseReleased", x: current.x, y: current.y, button: "left", buttons: 0, clickCount: 1 }).catch(() => {});
    }
  }
  await requireVirtualCursor(tabId, to.x, to.y, "click", { dragEnd: true, waitForPaint: true }, movement.documentId);
  await waitForCursorMotion(CLICK_FEEDBACK_MS);
  return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, steps };
}

async function pressKey(tabId, key, modifiers) {
  const definition = keyDefinition(key);
  const modifierMask = modifiers.reduce((mask, value) => mask | ({ alt: 1, control: 2, meta: 4, shift: 8 }[String(value).toLowerCase()] || 0), 0);
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyDown", ...definition, modifiers: modifierMask });
  await sendCdp(tabId, "Input.dispatchKeyEvent", { type: "keyUp", ...definition, modifiers: modifierMask });
  return { key, modifiers };
}

async function locate(tabId, locator, framePath) {
  validateLocatorQuery(locator);
  let frameContext = await resolveFrameContext(tabId, framePath);
  let result = await evaluateInContext(tabId, frameContext.contextId, `(${resolveLocator.toString()})(${JSON.stringify(locator || {})}, true)`, true, frameContext.sessionId);
  if (!result) throw codedError("LOCATOR_NOT_FOUND", `No element matched locator ${JSON.stringify(locator)}`);
  if (result.ambiguous) throw codedError("LOCATOR_AMBIGUOUS", `Locator matched ${result.count} elements`, result);
  if (frameContext.chain.length > 1) {
    frameContext = await resolveFrameContext(tabId, framePath, false);
    result = await evaluateInContext(tabId, frameContext.contextId, `(${resolveLocator.toString()})(${JSON.stringify(locator || {})}, false)`, true, frameContext.sessionId);
    if (!result) throw codedError("LOCATOR_NOT_FOUND", `No element matched locator ${JSON.stringify(locator)} after frame scrolling`);
    if (result.ambiguous) throw codedError("LOCATOR_AMBIGUOUS", `Locator matched ${result.count} elements after frame scrolling`, result);
  }
  return { ...result, x: result.x + frameContext.offsetX, y: result.y + frameContext.offsetY, frameId: frameContext.frameId, frameContext };
}

async function queryLocator(tabId, locator, operation, options, framePath) {
  validateLocatorQuery(locator);
  validateLocatorQueryOptions(operation, options);
  const frameContext = await resolveFrameContext(tabId, framePath);
  const result = await evaluateInContext(tabId, frameContext.contextId, `(${runLocatorQuery.toString()})(${JSON.stringify(locator)}, ${JSON.stringify(operation)}, ${JSON.stringify(options || {})})`, true, frameContext.sessionId);
  if (!result?.ok) {
    const failure = result?.error || { code: "BROWSER_ERROR", message: "Locator query failed" };
    throw codedError(failure.code, failure.message, failure.data);
  }
  return result.value;
}

async function waitForLocatorState(tabId, locator, framePath, state, timeoutMs) {
  const expected = String(state || "visible");
  if (!["attached", "detached", "visible", "hidden", "enabled", "disabled"].includes(expected)) {
    throw codedError("INVALID_PARAMS", "state must be attached, detached, visible, hidden, enabled, or disabled");
  }
  const timeout = boundedTimeout(timeoutMs, 5000);
  const started = Date.now();
  let last = { count: 0, visibleCount: 0, enabledCount: 0 };
  while (Date.now() - started <= timeout) {
    try {
      last = await queryLocator(tabId, locator, "state", {}, framePath);
      if (last.count > 1) throw codedError("LOCATOR_AMBIGUOUS", `Locator matched ${last.count} elements`, { count: last.count });
    } catch (error) {
      if (["FRAME_NOT_FOUND", "FRAME_CONTEXT_CHANGED"].includes(error.code)) last = { count: 0, visibleCount: 0, enabledCount: 0 };
      else throw error;
    }
    const matched = expected === "attached" ? last.count === 1
      : expected === "detached" ? last.count === 0
      : expected === "visible" ? last.visibleCount === 1
      : expected === "hidden" ? last.count === 0 || last.visibleCount === 0
      : expected === "enabled" ? last.count === 1 && last.enabledCount === 1
      : last.count === 1 && last.enabledCount === 0;
    if (matched) return { state: expected, elapsedMs: Date.now() - started, ...last };
    await delay(100);
  }
  throw codedError("LOCATOR_WAIT_TIMEOUT", `Timed out after ${timeout}ms waiting for locator state ${expected}`, { state: expected, timeoutMs: timeout, ...last });
}

async function waitForUrl(tabId, expectedUrl, options = {}) {
  const timeout = boundedTimeout(options.timeoutMs, 10000);
  const started = Date.now();
  while (Date.now() - started <= timeout) {
    const tab = await chrome.tabs.get(tabId);
    if (urlMatches(tab.url || "", expectedUrl, options.match)) {
      if (options.waitUntil) await waitForLoadState(tabId, options.waitUntil, Math.max(1, timeout - (Date.now() - started)));
      return { url: tab.url, elapsedMs: Date.now() - started };
    }
    await delay(100);
  }
  throw codedError("URL_WAIT_TIMEOUT", `Timed out after ${timeout}ms waiting for URL ${expectedUrl}`, { url: expectedUrl, timeoutMs: timeout });
}

async function waitForLoadState(tabId, state = "load", timeoutMs) {
  const expected = String(state || "load").toLowerCase();
  if (!["commit", "domcontentloaded", "load", "networkidle"].includes(expected)) {
    throw codedError("INVALID_PARAMS", "state must be commit, domcontentloaded, load, or networkidle");
  }
  const timeout = boundedTimeout(timeoutMs, 10000);
  const started = Date.now();
  if (expected === "networkidle") {
    await sendCdp(tabId, "Network.enable", {});
    if (!(networkRequestsByTab.get(tabId)?.size)) networkIdleSinceByTab.set(tabId, Date.now());
  }
  while (Date.now() - started <= timeout) {
    const top = await chrome.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
    let readyState = "";
    if (top?.documentId) readyState = await evaluateValue(tabId, "document.readyState").catch(() => "");
    const pending = networkRequestsByTab.get(tabId)?.size || 0;
    const idleFor = Date.now() - (networkIdleSinceByTab.get(tabId) || Date.now());
    const matched = expected === "commit" ? Boolean(top?.documentId)
      : expected === "domcontentloaded" ? ["interactive", "complete"].includes(readyState)
      : expected === "load" ? readyState === "complete"
      : readyState === "complete" && pending === 0 && idleFor >= 500;
    if (matched) return { state: expected, url: top?.url, documentId: top?.documentId, elapsedMs: Date.now() - started };
    await delay(100);
  }
  throw codedError("LOAD_STATE_TIMEOUT", `Timed out after ${timeout}ms waiting for load state ${expected}`, { state: expected, timeoutMs: timeout });
}

async function expectNavigation(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  const action = params.action;
  const allowed = new Set(["browser.click", "browser.press", "browser.navigate", "browser.back", "browser.forward", "browser.reload"]);
  if (!action || !allowed.has(action.method)) throw codedError("INVALID_PARAMS", "action.method is not supported by browser.expectNavigation");
  if (action.params?.tabId != null && action.params.tabId !== tabId) throw codedError("INVALID_PARAMS", "action tabId must match browser.expectNavigation tabId");
  const before = await chrome.webNavigation.getFrame({ tabId, frameId: 0 });
  const timeout = boundedTimeout(params.timeoutMs, 10000);
  const navigation = waitForNavigationChange(tabId, before, params.url, params.match, params.waitUntil, timeout);
  void navigation.catch(() => {});
  try {
    const actionResult = await execute(action.method, { ...(action.params || {}), tabId });
    return { actionResult, navigation: await navigation };
  } catch (error) {
    navigation.catch(() => {});
    throw error;
  }
}

async function waitForDownload(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  await ensureDebugger(tabId);
  const action = validateBoundAction(params.action, ["browser.click", "browser.coordinateClick"]);
  const timeout = boundedTimeout(params.timeoutMs, 120000);
  const startedAt = Date.now();
  const pending = createTabWaiter(downloadWaitersByTab, tabId, timeout, "DOWNLOAD_TIMEOUT", "download");
  void pending.promise.catch(() => {});
  try {
    const actionResult = await execute(action.method, { ...(action.params || {}), tabId });
    const started = await pending.promise;
    const download = await waitForChromeDownload(started, Math.max(1, timeout - (Date.now() - startedAt)));
    return { actionResult, download };
  } finally {
    pending.cancel();
  }
}

async function downloadMedia(params, settings) {
  const tabId = requireTabId(params);
  const timeout = boundedTimeout(params.timeoutMs, 120000);
  return waitForDownload({ tabId, timeoutMs: timeout, action: { method: "browser.click", params: { locator: params.locator, framePath: params.framePath } } }, settings);
}

async function waitForFileChooser(params, settings) {
  const tabId = requireTabId(params);
  await assertTabNotBlocked(tabId, settings);
  await ensureDebugger(tabId);
  const action = validateBoundAction(params.action, ["browser.click", "browser.coordinateClick"]);
  const timeout = boundedTimeout(params.timeoutMs, 30000);
  await sendCdp(tabId, "Page.setInterceptFileChooserDialog", { enabled: true });
  const pending = createTabWaiter(fileChooserWaitersByTab, tabId, timeout, "FILE_CHOOSER_TIMEOUT", "file chooser");
  void pending.promise.catch(() => {});
  try {
    const actionResult = await execute(action.method, { ...(action.params || {}), tabId });
    const chooser = await pending.promise;
    return { actionResult, chooserId: chooser.id, isMultiple: chooser.mode === "selectMultiple" };
  } finally {
    pending.cancel();
    await sendCdp(tabId, "Page.setInterceptFileChooserDialog", { enabled: false }).catch(() => {});
  }
}

async function setFileChooserFiles(tabId, chooserId, files) {
  const id = requireString(chooserId, "chooserId");
  if (!Array.isArray(files) || !files.length || files.length > 20 || files.some((file) => typeof file !== "string" || !file)) throw codedError("INVALID_PARAMS", "files must contain 1 to 20 paths");
  const chooser = fileChoosers.get(id);
  if (!chooser || chooser.tabId !== tabId) throw codedError("FILE_CHOOSER_NOT_FOUND", "The file chooser is missing, stale, or belongs to another tab");
  if (chooser.mode !== "selectMultiple" && files.length > 1) throw codedError("FILE_CHOOSER_MULTIPLE_NOT_ALLOWED", "This file chooser accepts only one file");
  await sendCdp(tabId, "DOM.setFileInputFiles", { backendNodeId: chooser.backendNodeId, files });
  fileChoosers.delete(id);
  return { chooserId: id, files: files.map((file) => file.split(/[\\/]/).pop()) };
}

function validateBoundAction(action, allowedMethods) {
  if (!action || !allowedMethods.includes(action.method)) throw codedError("INVALID_PARAMS", `action.method must be one of: ${allowedMethods.join(", ")}`);
  const actionUnknown = Object.keys(action).filter((key) => !["method", "params"].includes(key));
  if (actionUnknown.length || !action.params || typeof action.params !== "object" || Array.isArray(action.params)) throw codedError("INVALID_PARAMS", "action must contain only method and object params");
  const allowedParams = action.method === "browser.click" ? ["locator", "framePath", "button", "clickCount"] : ["x", "y", "button", "clickCount"];
  const unknown = Object.keys(action.params).filter((key) => !allowedParams.includes(key));
  if (unknown.length) throw codedError("INVALID_PARAMS", `Unknown action parameter: ${unknown[0]}`, { field: unknown[0] });
  if (action.method === "browser.click" && !action.params.locator) throw codedError("INVALID_PARAMS", "browser.click action requires locator");
  if (action.method === "browser.coordinateClick" && (!Number.isFinite(action.params.x) || !Number.isFinite(action.params.y))) throw codedError("INVALID_PARAMS", "browser.coordinateClick action requires numeric x and y");
  return action;
}

function createTabWaiter(registry, tabId, timeoutMs, code, label) {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  const waiters = registry.get(tabId) || new Set();
  const resolve = (value) => { cleanup(); resolvePromise(value); };
  waiters.add(resolve);
  registry.set(tabId, waiters);
  const timer = setTimeout(() => { cleanup(); rejectPromise(codedError(code, `Timed out after ${timeoutMs}ms waiting for ${label}`, { timeoutMs })); }, timeoutMs);
  const cleanup = () => { clearTimeout(timer); waiters.delete(resolve); if (!waiters.size) registry.delete(tabId); };
  return { promise, cancel: cleanup };
}

async function waitForChromeDownload(started, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const matches = await chrome.downloads.search({ startedAfter: new Date(started.startedAt - 2000).toISOString(), orderBy: ["-startTime"], limit: 50 });
    const item = matches.find((entry) => (entry.url === started.url || entry.finalUrl === started.url) && new Date(entry.startTime || 0).getTime() >= started.startedAt - 2000);
    if (item) {
      if (item.state === "complete") return sanitizeDownload(item, started);
      if (item.state === "interrupted") throw codedError("DOWNLOAD_FAILED", `Download was interrupted: ${item.error || "unknown"}`, { id: item.id, error: item.error });
    }
    await delay(100);
  }
  throw codedError("DOWNLOAD_TIMEOUT", `Timed out after ${timeoutMs}ms waiting for download completion`, { timeoutMs });
}

function sanitizeDownload(item, started) {
  return { id: item.id, guid: started.guid, suggestedFilename: started.suggestedFilename, filename: String(item.filename || "").split(/[\\/]/).pop(), path: item.filename, state: item.state, bytesReceived: item.bytesReceived, totalBytes: item.totalBytes, url: item.finalUrl || item.url };
}

function inspectDownloadTarget(locator) {
  let candidates;
  try { candidates = locator.css ? [...document.querySelectorAll(locator.css)] : locator.testId ? [...document.querySelectorAll(`[data-testid="${String(locator.testId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)] : [...document.querySelectorAll("a[download]")]; } catch { return { ok: false, code: "INVALID_LOCATOR", message: "Invalid CSS locator" }; }
  if (locator.text) candidates = candidates.filter((el) => String(el.innerText || el.textContent || "").includes(locator.text));
  if (candidates.length !== 1) return { ok: false, code: candidates.length ? "LOCATOR_AMBIGUOUS" : "LOCATOR_NOT_FOUND", message: `Locator matched ${candidates.length} download targets` };
  const element = candidates[0];
  const raw = element.href;
  if (!raw) return { ok: false, code: "DOWNLOAD_TARGET_INVALID", message: "Target has no downloadable URL" };
  const url = new URL(raw, location.href).href;
  if (element.tagName !== "A" || !element.hasAttribute("download")) return { ok: false, code: "DOWNLOAD_TARGET_INVALID", message: "Media download requires an explicit anchor download target" };
  return { ok: true, value: { url } };
}

async function waitForNavigationChange(tabId, before, expectedUrl, match, waitUntil = "load", timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const current = await chrome.webNavigation.getFrame({ tabId, frameId: 0 }).catch(() => null);
    const changed = current && (current.documentId !== before?.documentId || current.url !== before?.url);
    if (changed && (!expectedUrl || urlMatches(current.url || "", expectedUrl, match))) {
      const remaining = Math.max(1, timeoutMs - (Date.now() - started));
      const loaded = await waitForLoadState(tabId, waitUntil || "load", remaining);
      return { ...loaded, fromUrl: before?.url, toUrl: current.url };
    }
    await delay(50);
  }
  throw codedError("NAVIGATION_TIMEOUT", `Timed out after ${timeoutMs}ms waiting for navigation`, { timeoutMs, fromUrl: before?.url, expectedUrl });
}

function urlMatches(actual, expected, mode) {
  const selected = mode || (expected.includes("*") ? "glob" : "exact");
  if (selected === "exact") return actual === expected;
  if (selected === "contains") return actual.includes(expected);
  if (selected === "glob") {
    const pattern = expected.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${pattern}$`).test(actual);
  }
  throw codedError("INVALID_PARAMS", "match must be exact, contains, or glob");
}

function boundedTimeout(value, fallback) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > 120000) throw codedError("INVALID_PARAMS", "timeoutMs must be an integer between 1 and 120000");
  return value;
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function setFileInput(tabId, selector, files, framePath) {
  if (!Array.isArray(files) || files.length === 0) throw codedError("INVALID_PARAMS", "files must be a non-empty array");
  const frameContext = await resolveFrameContext(tabId, framePath);
  let remote;
  try {
    remote = await evaluateInContext(tabId, frameContext.contextId, `document.querySelector(${JSON.stringify(selector)})`, false, frameContext.sessionId);
  } catch (error) {
    throw codedError("INVALID_LOCATOR", `Invalid file input selector: ${selector}`, { cause: error.code });
  }
  if (!remote?.objectId) throw codedError("LOCATOR_NOT_FOUND", `No file input matched ${selector}`);
  try {
    await assertFrameContextFresh(tabId, frameContext);
    await sendCdpInSession(tabId, frameContext.sessionId, "DOM.setFileInputFiles", { objectId: remote.objectId, files });
  } finally {
    await sendCdpInSession(tabId, frameContext.sessionId, "Runtime.releaseObject", { objectId: remote.objectId }).catch(() => {});
  }
  return { selector, frameId: frameContext.frameId, files: files.map((file) => file.split(/[\\/]/).pop()) };
}

function getEvents(params) {
  const afterSequence = Number(params.afterSequence || 0);
  const limit = Math.min(Math.max(Number(params.limit || 100), 1), 500);
  const filtered = events.filter((event) => event.sequence > afterSequence && (!params.tabId || event.source?.tabId === params.tabId) && (!params.methods || params.methods.includes(event.method)));
  const page = filtered.slice(0, limit);
  return { events: page, cursor: page.at(-1)?.sequence || afterSequence, hasMore: filtered.length > page.length, truncated: events.length > 0 && afterSequence < events[0].sequence - 1 };
}

function recordConsoleLog(tabId, entry) {
  const logs = consoleLogsByTab.get(tabId) || [];
  logs.push({ sequence: ++consoleSequence, timestamp: entry.timestamp, level: entry.level, text: String(entry.text || "").slice(0, 10000), url: String(entry.url || "").slice(0, 4096) });
  if (logs.length > 500) logs.splice(0, logs.length - 500);
  consoleLogsByTab.set(tabId, logs);
}

function getConsoleLogs(tabId, params) {
  const afterSequence = params.afterSequence == null ? 0 : Number(params.afterSequence);
  if (!Number.isInteger(afterSequence) || afterSequence < 0) throw codedError("INVALID_PARAMS", "afterSequence must be a non-negative integer");
  const limit = params.limit == null ? 100 : Number(params.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw codedError("INVALID_PARAMS", "limit must be an integer between 1 and 500");
  const allowedLevels = new Set(["log", "debug", "info", "warning", "error"]);
  if (params.levels != null && (!Array.isArray(params.levels) || params.levels.some((level) => !allowedLevels.has(level)))) throw codedError("INVALID_PARAMS", "levels contains an unsupported console level");
  const levels = Array.isArray(params.levels) ? new Set(params.levels) : null;
  if (params.text != null && (typeof params.text !== "string" || params.text.length > 1000)) throw codedError("INVALID_PARAMS", "text must be a string with at most 1000 characters");
  const text = String(params.text || "").toLowerCase();
  const all = consoleLogsByTab.get(tabId) || [];
  const filtered = all.filter((entry) => entry.sequence > afterSequence && (!levels || levels.has(entry.level)) && (!text || entry.text.toLowerCase().includes(text)));
  const page = filtered.slice(0, limit);
  return { logs: page, cursor: page.at(-1)?.sequence || afterSequence, hasMore: filtered.length > page.length, truncated: all.length > 0 && afterSequence < all[0].sequence - 1 };
}

function normalizeConsoleLevel(value) {
  const level = String(value || "log").toLowerCase();
  if (["error", "warning", "info", "debug"].includes(level)) return level;
  if (level === "warn") return "warning";
  return "log";
}

function summarizeConsoleArgs(args) {
  return (args || []).map((arg) => {
    if (["string", "number", "boolean", "bigint"].includes(arg?.type)) return String(arg.value ?? arg.unserializableValue ?? "");
    if (arg?.type === "undefined") return "undefined";
    if (arg?.subtype === "null") return "null";
    return String(arg?.description || `[${arg?.subtype || arg?.type || "object"}]`).slice(0, 1000);
  }).join(" ").slice(0, 10000);
}

function recordEvent(event) {
  events.push({ sequence: ++eventSequence, timestamp: Date.now(), ...event });
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

async function assertTabNotBlocked(tabId, settings) {
  const tab = await chrome.tabs.get(tabId);
  await assertUrlNotBlocked(tab.url || "about:blank", settings);
}

async function assertUrlNotBlocked(value, settings) {
  if (!value || /^(about|chrome|chrome-extension):/.test(value)) return;
  const host = new URL(value).hostname.toLowerCase();
  if (settings.blockedHosts.some((entry) => host === entry || host.endsWith(`.${entry}`))) {
    throw codedError("SITE_BLOCKED", `Site is blocked by extension settings: ${host}`);
  }
}

function readTextExpression(maxChars = 50000) {
  return `(() => ({ url: location.href, title: document.title, text: (document.body?.innerText || "").slice(0, ${Math.max(1, Math.min(Number(maxChars) || 50000, 500000))}) }))()`;
}

function domSnapshotExpression(params) {
  const maxNodes = Math.max(1, Math.min(Number(params.maxNodes) || 1000, 5000));
  const maxTextChars = Math.max(100, Math.min(Number(params.maxTextChars) || 20000, 200000));
  return `(() => {
    const maxNodes = ${maxNodes}; const maxTextChars = ${maxTextChars};
    const selector = (el) => {
      if (el.id && CSS.escape) return '#' + CSS.escape(el.id);
      const parts = []; let node = el;
      while (node && node.nodeType === 1 && parts.length < 6) {
        let part = node.localName; if (!part) break;
        const parent = node.parentElement;
        if (parent) { const peers = [...parent.children].filter(x => x.localName === node.localName); if (peers.length > 1) part += ':nth-of-type(' + (peers.indexOf(node) + 1) + ')'; }
        parts.unshift(part); node = parent;
      }
      return parts.join(' > ');
    };
    const role = (el) => el.getAttribute('role') || ({A:'link',BUTTON:'button',INPUT: el.type === 'checkbox' ? 'checkbox' : 'textbox',SELECT:'combobox',TEXTAREA:'textbox'}[el.tagName] || null);
    const nodes = [];
    for (const el of document.querySelectorAll('a,button,input,select,textarea,[role],[contenteditable="true"],summary,[tabindex]')) {
      if (nodes.length >= maxNodes) break;
      const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
      if (r.width <= 0 || r.height <= 0 || style.visibility === 'hidden' || style.display === 'none') continue;
      nodes.push({ selector: selector(el), tag: el.localName, role: role(el), name: (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || '').trim().slice(0, 500), type: el.getAttribute('type'), disabled: !!el.disabled, checked: el.checked, rect: {x:r.x,y:r.y,width:r.width,height:r.height} });
    }
    return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, maxTextChars), nodes };
  })()`;
}

function resolveLocator(locator, scroll = true) {
  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const implicitRole = (el) => el.getAttribute("role") || ({
    A: el.hasAttribute("href") ? "link" : null,
    BUTTON: "button",
    SELECT: "combobox",
    TEXTAREA: "textbox",
    INPUT: el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : ["button", "submit", "reset"].includes(el.type) ? "button" : "textbox"
  }[el.tagName] || null);
  const accessibleName = (el) => normalize(el.getAttribute("aria-label") || (el.labels ? [...el.labels].map((x) => x.innerText).join(" ") : "") || el.innerText || el.value || el.getAttribute("placeholder"));
  let candidates;
  if (locator.css) candidates = [...document.querySelectorAll(locator.css)];
  else if (locator.testId) candidates = [...document.querySelectorAll(`[data-testid="${CSS.escape(locator.testId)}"]`)];
  else candidates = [...document.querySelectorAll("a,button,input,select,textarea,[role],[contenteditable='true'],summary,[tabindex]")];
  if (locator.role) candidates = candidates.filter((el) => implicitRole(el) === locator.role);
  if (locator.label) candidates = candidates.filter((el) => accessibleName(el) === normalize(locator.label) || (!locator.exact && accessibleName(el).includes(normalize(locator.label))));
  if (locator.text) candidates = candidates.filter((el) => normalize(el.innerText || el.textContent) === normalize(locator.text) || (!locator.exact && normalize(el.innerText || el.textContent).includes(normalize(locator.text))));
  if (locator.name) candidates = candidates.filter((el) => accessibleName(el) === normalize(locator.name) || (!locator.exact && accessibleName(el).includes(normalize(locator.name))));
  candidates = candidates.filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; });
  if (candidates.length !== 1) return candidates.length === 0 ? null : { ambiguous: true, count: candidates.length };
  const el = candidates[0]; if (scroll) el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.localName, role: implicitRole(el), name: accessibleName(el) };
}

function keyDefinition(key) {
  const known = {
    Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
    Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
    Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
    Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }
  };
  if (known[key]) return known[key];
  if (key.length === 1) return { key, text: key, code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : undefined };
  return { key, code: key };
}

function capabilityList() {
  return ["tabs", "tabGroups", "navigation", "domSnapshot", "locatorQueries", "frameLocators", "elementWaits", "navigationWaits", "formControls", "sessionLeases", "tabLifecycle", "downloadLifecycle", "fileChooserLifecycle", "consoleLogs", "accessibility", "playwrightStyleLocators", "screenshots", "coordinateInput", "virtualCursor", "drag", "input", "fileUpload", "javascriptDialogs", "downloads", "history", "bookmarks", "cdp", "events"];
}

function requireTabId(params) {
  const value = Number(params.tabId);
  if (!Number.isInteger(value) || value < 0) throw codedError("INVALID_PARAMS", "tabId must be a non-negative integer");
  return value;
}

function requireString(value, name) {
  if (typeof value !== "string" || !value.trim()) throw codedError("INVALID_PARAMS", `${name} must be a non-empty string`);
  return value;
}

function requireBoolean(value, name) {
  if (typeof value !== "boolean") throw codedError("INVALID_PARAMS", `${name} must be a boolean`);
  return value;
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function codedError(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}

function assertOnlyParams(params, allowed) {
  const unknown = Object.keys(params || {}).find((key) => !allowed.includes(key));
  if (unknown) throw codedError("INVALID_PARAMS", `Unknown parameter: ${unknown}`, { field: unknown });
  return params;
}

connectNative();
