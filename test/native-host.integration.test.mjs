import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BridgeClient } from "../src/bridge-client.mjs";
import { NativeMessageDecoder, encodeNativeMessage } from "../src/native-framing.mjs";
import { VERSION } from "../src/version.mjs";

test("native host publishes an authenticated pipe and accepts bridge RPC", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-host-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => {
    child.stdin.end();
    child.kill();
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const client = new BridgeClient(descriptor);
  const info = await client.call("bridge.getInfo");

  assert.equal(info.extensionConnected, true);
  assert.equal(info.version, VERSION);
  assert.equal(info.extension.extensionId, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(info.transport.type, "local-pipe-jsonrpc");

  const nativeRequest = nextNativeMessage(child.stdout);
  const browserInfoPromise = client.call("browser.getInfo");
  const request = await nativeRequest;
  assert.equal(request.method, "browser.getInfo");
  child.stdin.write(encodeNativeMessage({ type: "response", id: request.id, result: { name: "Test Chrome", type: "extension" } }));
  assert.deepEqual(await browserInfoPromise, { name: "Test Chrome", type: "extension" });
});

test("native host authorizes every resolved frame and keeps the resolver private", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-frame-policy-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir },
    stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => {
    child.stdin.end();
    child.kill();
    await fs.rm(taskDir, { recursive: true, force: true });
  });

  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const client = new BridgeClient(JSON.parse(await fs.readFile(descriptorPath, "utf8")));
  const messages = createNativeMessageQueue(child.stdout);

  await assert.rejects(
    client.call("_bridge.resolveFramePath", { tabId: 7, framePath: [{ css: "iframe" }] }),
    (error) => error.code === "METHOD_NOT_FOUND"
  );

  const claimPromise = client.call("browser.claimTab", { tabId: 7 });
  const claimGetTab = await messages.next();
  assert.equal(claimGetTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: claimGetTab.id, result: { id: 7, url: "http://127.0.0.1/test" } }));
  const claim = await messages.next();
  assert.equal(claim.method, "browser.claimTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 7, url: "http://127.0.0.1/test" } }));
  await claimPromise;

  const clickPromise = client.call("browser.click", { tabId: 7, locator: { text: "Continue" }, framePath: [{ css: "iframe" }] });
  const getTab = await messages.next();
  assert.equal(getTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: getTab.id, result: { id: 7, url: "http://127.0.0.1/test" } }));

  const resolveFrame = await messages.next();
  assert.equal(resolveFrame.method, "_bridge.resolveFramePath");
  child.stdin.write(encodeNativeMessage({ type: "response", id: resolveFrame.id, result: { frames: [{ url: "https://unapproved.example/frame" }] } }));

  await assert.rejects(clickPromise, (error) => error.code === "SITE_APPROVAL_REQUIRED");
  await assert.rejects(messages.next(100), /Timed out waiting for native message/);

  const detachedPromise = client.call("browser.waitFor", { tabId: 7, locator: { text: "Gone" }, framePath: [{ css: "iframe" }], state: "detached", timeoutMs: 1000 });
  const detachedGetTab = await messages.next();
  assert.equal(detachedGetTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: detachedGetTab.id, result: { id: 7, url: "http://127.0.0.1/test" } }));
  const detachedResolveFrame = await messages.next();
  assert.equal(detachedResolveFrame.method, "_bridge.resolveFramePath");
  child.stdin.write(encodeNativeMessage({ type: "response", id: detachedResolveFrame.id, error: { code: "FRAME_NOT_FOUND", message: "Frame is gone" } }));
  const detachedWait = await messages.next();
  assert.equal(detachedWait.method, "browser.waitFor");
  child.stdin.write(encodeNativeMessage({ type: "response", id: detachedWait.id, result: { state: "detached", count: 0 } }));
  assert.equal((await detachedPromise).state, "detached");
});

test("native host shares reads but blocks another session from mutating an owned tab", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-session-policy-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const owner = new BridgeClient(descriptor, 3000, "session-owner");
  const observer = new BridgeClient(descriptor, 3000, "session-observer");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 9 });
  const getTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: getTab.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  const claim = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  await claimPromise;

  await assert.rejects(observer.call("browser.closeTab", { tabId: 9 }), (error) => error.code === "TAB_OWNED_BY_ANOTHER_SESSION" && !JSON.stringify(error).includes("session-owner"));
  await assert.rejects(messages.next(100), /Timed out waiting for native message/);

  const readPromise = observer.call("browser.getTab", { tabId: 9 });
  const read = await messages.next();
  assert.equal(read.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: read.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  assert.equal((await readPromise).id, 9);
});

test("native host owns and cleans a child tab reported by a completed click", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-created-tab-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const owner = new BridgeClient(descriptor, 3000, "session-created-tab");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 9 });
  const claimGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claimGetTab.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  const claim = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  await claimPromise;

  const clickPromise = owner.call("browser.click", { tabId: 9, locator: { text: "New tab" } });
  const clickGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: clickGetTab.id, result: { id: 9, url: "http://127.0.0.1/test" } }));
  const click = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: click.id, result: { newTabOpened: true, createdTabIds: [10] } }));
  const consume = await messages.next();
  assert.equal(consume.method, "_bridge.consumeCreatedTabs");
  child.stdin.write(encodeNativeMessage({ type: "response", id: consume.id, result: { tabIds: [] } }));
  assert.deepEqual(await clickPromise, { newTabOpened: true, createdTabIds: [10] });
  assert.equal((await owner.call("browser.getLease", { tabId: 10 })).temporary, true);

  const endPromise = owner.call("browser.endSession", {});
  const inspect = await messages.next();
  assert.equal(inspect.method, "_bridge.inspectUnsavedWork");
  child.stdin.write(encodeNativeMessage({ type: "response", id: inspect.id, result: { unsaved: false } }));
  const close = await messages.next();
  assert.equal(close.method, "browser.closeTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: close.id, result: { closed: true } }));
  const ended = await endPromise;
  assert.deepEqual(ended.closed, [10]);
  assert.equal(ended.preserved.length, 1);
  assert.equal(ended.preserved[0].tabId, 9);
  assert.equal(ended.preserved[0].reason, "user-tab");
});

test("native host gates and isolates the memory-only session clipboard", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-clipboard-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const descriptor = JSON.parse(await fs.readFile(descriptorPath, "utf8"));
  const owner = new BridgeClient(descriptor, 3000, "clipboard-owner");
  const other = new BridgeClient(descriptor, 3000, "clipboard-other");
  const items = [{ mimeType: "text/plain", data: "session only" }];

  const initialPolicy = await owner.call("policy.get", {});
  assert.equal(initialPolicy.allowSessionClipboardRead, false);
  assert.equal(initialPolicy.allowSessionClipboardWrite, false);
  await assert.rejects(owner.call("browser.sessionClipboardWrite", { items }), { code: "SESSION_CLIPBOARD_WRITE_APPROVAL_REQUIRED" });

  await owner.call("policy.setSessionClipboardWrite", { enabled: true });
  assert.deepEqual((await owner.call("browser.sessionClipboardWrite", { items })).mimeTypes, ["text/plain"]);
  await assert.rejects(owner.call("browser.sessionClipboardRead", {}), { code: "SESSION_CLIPBOARD_READ_APPROVAL_REQUIRED" });

  await owner.call("policy.setSessionClipboardRead", { enabled: true });
  assert.equal((await owner.call("browser.sessionClipboardRead", {})).items[0].data, "session only");
  assert.equal((await other.call("browser.sessionClipboardRead", {})).itemCount, 0);
  await assert.rejects(owner.call("browser.sessionClipboardRead", { unknown: true }), { code: "INVALID_PARAMS" });

  const ended = await owner.call("browser.endSession", {});
  assert.equal(ended.clipboardCleared, true);
  assert.equal((await owner.call("browser.sessionClipboardRead", {})).itemCount, 0);
});

test("native host resets temporary viewport overrides when a session ends", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-viewport-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const owner = new BridgeClient(JSON.parse(await fs.readFile(descriptorPath, "utf8")), 3000, "viewport-owner");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 21 });
  const claimGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claimGetTab.id, result: { id: 21, url: "http://127.0.0.1/test" } }));
  const claim = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 21, url: "http://127.0.0.1/test" } }));
  await claimPromise;

  const setPromise = owner.call("browser.setViewport", { tabId: 21, width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  const setGetTab = await messages.next();
  assert.equal(setGetTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: setGetTab.id, result: { id: 21, url: "http://127.0.0.1/test" } }));
  const set = await messages.next();
  assert.equal(set.method, "browser.setViewport");
  child.stdin.write(encodeNativeMessage({ type: "response", id: set.id, result: { width: 390, height: 844, emulated: true } }));
  assert.equal((await setPromise).emulated, true);

  const endPromise = owner.call("browser.endSession", {});
  const reset = await messages.next();
  assert.equal(reset.method, "browser.resetViewport");
  assert.deepEqual(reset.params, { tabId: 21 });
  child.stdin.write(encodeNativeMessage({ type: "response", id: reset.id, result: { width: 2048, height: 1089, emulated: false, changed: true } }));
  const ended = await endPromise;
  assert.deepEqual(ended.viewportReset, [21]);
  assert.deepEqual(ended.viewportResetFailed, []);
  assert.equal(ended.preserved[0].reason, "user-tab");
});

test("native host preserves an explicitly retained viewport when a session ends", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-preserved-viewport-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const owner = new BridgeClient(JSON.parse(await fs.readFile(descriptorPath, "utf8")), 3000, "viewport-preserve-owner");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 22 });
  const claimGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claimGetTab.id, result: { id: 22, url: "http://127.0.0.1/test" } }));
  const claim = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 22, url: "http://127.0.0.1/test" } }));
  await claimPromise;

  const setPromise = owner.call("browser.setViewport", { tabId: 22, width: 1280, height: 720, preserveOnSessionEnd: true });
  const setGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: setGetTab.id, result: { id: 22, url: "http://127.0.0.1/test" } }));
  const set = await messages.next();
  assert.equal(set.method, "browser.setViewport");
  child.stdin.write(encodeNativeMessage({ type: "response", id: set.id, result: { width: 1280, height: 720, emulated: true } }));
  await setPromise;

  const ended = await owner.call("browser.endSession", {});
  assert.deepEqual(ended.viewportReset, []);
  assert.deepEqual(ended.viewportResetFailed, []);
  assert.equal(ended.preserved[0].reason, "user-tab");
  await assert.rejects(messages.next(100), /Timed out waiting for native message/);
});

test("native host filters, packages, and cleans current-document resource exports", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-resource-export-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const owner = new BridgeClient(JSON.parse(await fs.readFile(descriptorPath, "utf8")), 3000, "resource-export-owner");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 31 });
  const claimGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claimGetTab.id, result: { id: 31, url: "http://127.0.0.1/page" } }));
  const claim = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: claim.id, result: { id: 31, url: "http://127.0.0.1/page" } }));
  await claimPromise;

  const listPromise = owner.call("browser.listObservedResources", { tabId: 31, maxResults: 10 });
  const listGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: listGetTab.id, result: { id: 31, url: "http://127.0.0.1/page" } }));
  const list = await messages.next();
  assert.equal(list.method, "browser.listObservedResources");
  child.stdin.write(encodeNativeMessage({ type: "response", id: list.id, result: {
    documentId: "doc-1", pageUrl: "http://127.0.0.1/page", resourceCount: 2, truncated: false,
    resources: [
      { resourceId: "r1", url: "http://127.0.0.1/app.css", type: "Stylesheet", mimeType: "text/css" },
      { resourceId: "r2", url: "https://unapproved.example/app.js", type: "Script", mimeType: "text/javascript" }
    ]
  } }));
  const listed = await listPromise;
  assert.deepEqual(listed.resources.map(({ resourceId }) => resourceId), ["r1"]);
  assert.equal(listed.omittedUnapproved, 1);
  assert.equal(listed.truncated, true);

  const exportPromise = owner.call("browser.exportObservedResources", { tabId: 31, resourceIds: ["r1"] });
  const exportGetTab = await messages.next();
  child.stdin.write(encodeNativeMessage({ type: "response", id: exportGetTab.id, result: { id: 31, url: "http://127.0.0.1/page" } }));
  const collect = await messages.next();
  assert.equal(collect.method, "_bridge.collectObservedResources");
  child.stdin.write(encodeNativeMessage({ type: "response", id: collect.id, result: {
    documentId: "doc-1", pageUrl: "http://127.0.0.1/page",
    resources: [{ resourceId: "r1", url: "http://127.0.0.1/app.css", type: "Stylesheet", mimeType: "text/css", suggestedFilename: "app.css", content: "body{}", base64Encoded: false }]
  } }));
  const exported = await exportPromise;
  assert.equal(exported.resourceCount, 1);
  assert.equal(exported.lifecycle, "session-temporary");
  await fs.access(exported.path);

  const ended = await owner.call("browser.endSession", {});
  assert.equal(ended.resourceExportsRemoved, 1);
  await assert.rejects(fs.access(exported.path), { code: "ENOENT" });
});

test("native host requires and consumes a machine-readable upload action intent", async (t) => {
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-browser-action-intent-test-"));
  const uploadPath = path.join(taskDir, "reviewed.txt");
  await fs.writeFile(uploadPath, "reviewed");
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
  });
  t.after(async () => { child.stdin.end(); child.kill(); await fs.rm(taskDir, { recursive: true, force: true }); });
  child.stdin.write(encodeNativeMessage({ type: "hello", extensionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", extensionVersion: "test" }));
  const descriptorPath = await waitForDescriptor(path.join(taskDir, "runtime"));
  const owner = new BridgeClient(JSON.parse(await fs.readFile(descriptorPath, "utf8")), 3000, "action-intent-owner");
  const messages = createNativeMessageQueue(child.stdout);

  const claimPromise = owner.call("browser.claimTab", { tabId: 41 });
  for (let index = 0; index < 2; index += 1) {
    const request = await messages.next();
    child.stdin.write(encodeNativeMessage({ type: "response", id: request.id, result: { id: 41, url: "http://127.0.0.1/form" } }));
  }
  await claimPromise;

  await assert.rejects(owner.call("browser.setFileInput", { tabId: 41, selector: "input[type=file]", files: [uploadPath] }), { code: "ACTION_INTENT_REQUIRED" });

  const preparePromise = owner.call("browser.prepareActionIntent", {
    tabId: 41, actionType: "upload", summary: "Upload reviewed fixture", dataTypes: ["text/plain"],
    action: { method: "browser.setFileInput", params: { selector: "input[type=file]", files: [uploadPath] } }
  });
  const prepareGetTab = await messages.next();
  assert.equal(prepareGetTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: prepareGetTab.id, result: { id: 41, url: "http://127.0.0.1/form" } }));
  const prepareIdentity = await messages.next();
  assert.equal(prepareIdentity.method, "_bridge.getDocumentIdentity");
  child.stdin.write(encodeNativeMessage({ type: "response", id: prepareIdentity.id, result: { tabId: 41, documentId: "doc-form-1", url: "http://127.0.0.1/form" } }));
  const intent = await preparePromise;
  assert.equal(intent.confirmationRequired, true);
  assert.equal(intent.targetOrigin, "http://127.0.0.1");

  await assert.rejects(owner.call("browser.executeActionIntent", { intentId: intent.intentId }), (error) => error.code === "ACTION_CONFIRMATION_REQUIRED" && error.details?.riskClass === "sensitive-data-transfer");
  const confirmed = await owner.call("browser.confirmActionIntent", { intentId: intent.intentId, decision: "approve" });
  assert.equal(confirmed.status, "confirmed");

  const executePromise = owner.call("browser.executeActionIntent", { intentId: intent.intentId });
  const executeIdentity = await messages.next();
  assert.equal(executeIdentity.method, "_bridge.getDocumentIdentity");
  child.stdin.write(encodeNativeMessage({ type: "response", id: executeIdentity.id, result: { tabId: 41, documentId: "doc-form-1", url: "http://127.0.0.1/form" } }));
  const executeGetTab = await messages.next();
  assert.equal(executeGetTab.method, "browser.getTab");
  child.stdin.write(encodeNativeMessage({ type: "response", id: executeGetTab.id, result: { id: 41, url: "http://127.0.0.1/form" } }));
  const upload = await messages.next();
  assert.equal(upload.method, "browser.setFileInput");
  child.stdin.write(encodeNativeMessage({ type: "response", id: upload.id, result: { ok: true, fileCount: 1 } }));
  const executed = await executePromise;
  assert.equal(executed.intent.status, "consumed");
  assert.equal(executed.actionResult.fileCount, 1);

  const ended = await owner.call("browser.endSession", {});
  assert.equal(ended.actionIntentsCleared, 1);
});

async function waitForDescriptor(directory, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const name = (await fs.readdir(directory)).find((entry) => /^bridge-\d+\.json$/.test(entry));
      if (name) return path.join(directory, name);
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Native host did not publish a runtime descriptor");
}

function nextNativeMessage(stream) {
  const decoder = new NativeMessageDecoder();
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      try {
        const [message] = decoder.push(chunk);
        if (!message) return;
        stream.off("data", onData);
        resolve(message);
      } catch (error) {
        stream.off("data", onData);
        reject(error);
      }
    };
    stream.on("data", onData);
  });
}

function createNativeMessageQueue(stream) {
  const decoder = new NativeMessageDecoder();
  const queued = [];
  const waiters = [];
  stream.on("data", (chunk) => {
    for (const message of decoder.push(chunk)) {
      const waiter = waiters.shift();
      if (waiter) waiter.resolve(message);
      else queued.push(message);
    }
  });
  return {
    next(timeoutMs = 3000) {
      if (queued.length) return Promise.resolve(queued.shift());
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject };
        waiters.push(waiter);
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("Timed out waiting for native message"));
        }, timeoutMs);
        waiter.resolve = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
      });
    }
  };
}
