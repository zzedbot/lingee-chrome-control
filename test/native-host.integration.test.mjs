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
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-host-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: taskDir },
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
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-frame-policy-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: taskDir },
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
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "universal-browser-session-policy-test-"));
  const child = spawn(process.execPath, [path.resolve("src/native-host.mjs")], {
    env: { ...process.env, UNIVERSAL_BROWSER_BRIDGE_HOME: taskDir }, stdio: ["pipe", "pipe", "pipe"]
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
