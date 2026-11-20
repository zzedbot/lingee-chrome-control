import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STANDARD_BRIDGE_METHODS } from "../skills/lingee-browser-control/scripts/runtime/standard-capabilities.mjs";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const invokeUrl = pathToFileURL(
  path.join(workspaceRoot, "skills", "lingee-browser-control", "scripts", "invoke.mjs")
).href;

async function createBridgeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "lingee-browser-bridge-"));
  await mkdir(path.join(root, "src"));
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({ name: "lingee-browser-agent-bridge" })
  );
  await writeFile(path.join(root, "src", "bridge-client.mjs"), "export {};\n");
  return root;
}

async function withFixture(run) {
  const root = await createBridgeFixture();
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function invokeModule() {
  return import(invokeUrl);
}

test("installed Skill uses its bundled Bridge Client without a repository checkout", async () => {
  const isolatedRoot = await mkdtemp(path.join(os.tmpdir(), "lingee-skill-standalone-"));
  const isolatedSkill = path.join(isolatedRoot, "lingee-browser-control");
  const bridgeHome = path.join(isolatedRoot, "bridge-home");
  try {
    await cp(path.join(workspaceRoot, "skills", "lingee-browser-control"), isolatedSkill, { recursive: true });
    const env = { ...process.env, LINGEE_BROWSER_BRIDGE_HOME: bridgeHome };
    delete env.LINGEE_BROWSER_BRIDGE_ROOT;
    const result = await runNode([path.join(isolatedSkill, "scripts", "invoke.mjs"), "instances"], { env, cwd: isolatedRoot });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), []);
  } finally {
    await rm(isolatedRoot, { recursive: true, force: true });
  }
});

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const { input, ...spawnOptions } = options;
    const child = spawn(process.execPath, args, { ...spawnOptions, stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input);
  });
}

test("explicit bridge root wins", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      const root = await locateBridgeRoot({
        env: { LINGEE_BROWSER_BRIDGE_ROOT: fixtureRoot },
        cwd: unrelatedDir,
        scriptDir: unrelatedDir
      });
      assert.equal(root, fixtureRoot);
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("locates the bridge root upward from the Skill path", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const skillScriptDir = path.join(fixtureRoot, "skills", "lingee-browser-control", "scripts");
    await mkdir(skillScriptDir, { recursive: true });
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      assert.equal(
        await locateBridgeRoot({ env: {}, cwd: unrelatedDir, scriptDir: skillScriptDir }),
        fixtureRoot
      );
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("locates the bridge root upward from the current directory", async () => {
  await withFixture(async (fixtureRoot) => {
    const { locateBridgeRoot } = await invokeModule();
    const nestedCwd = path.join(fixtureRoot, "work", "nested");
    await mkdir(nestedCwd, { recursive: true });
    const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
    try {
      assert.equal(
        await locateBridgeRoot({ env: {}, cwd: nestedCwd, scriptDir: unrelatedDir }),
        fixtureRoot
      );
    } finally {
      await rm(unrelatedDir, { recursive: true, force: true });
    }
  });
});

test("reports a structured error when no bridge project is found", async () => {
  const { locateBridgeRoot } = await invokeModule();
  const unrelatedDir = await mkdtemp(path.join(os.tmpdir(), "unrelated-"));
  try {
    await assert.rejects(
      () => locateBridgeRoot({ env: {}, cwd: unrelatedDir, scriptDir: unrelatedDir }),
      (error) => error.error === error.message
        && error.code === "BRIDGE_ROOT_NOT_FOUND"
        && Array.isArray(error.details?.searched)
    );
  } finally {
    await rm(unrelatedDir, { recursive: true, force: true });
  }
});

test("parses instances invocation", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["instances"]), { mode: "instances" });
});

test("CLI self-description is local and deterministic", async () => {
  const { parseInvokeArgs, runInvocation } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["methods"]), { mode: "methods" });
  assert.deepEqual(parseInvokeArgs(["describe", "browser.locatorState"]), { mode: "describe", method: "browser.locatorState" });
  const info = await runInvocation({ mode: "info" });
  assert.equal(info.name, "lingee-browser-control");
  assert.equal(info.version, "0.2.2");
  assert.match(info.entrypoint, /invoke\.mjs$/);
  const description = await runInvocation({ mode: "describe", method: "browser.locatorState" });
  assert.equal(description.tool, "browser_locator_state");
});

test("parses a call invocation with JSON parameters", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["call", "browser.listTabs", "{}"], { platform: "linux" }), {
    mode: "call",
    method: "browser.listTabs",
    params: {}
  });
});

test("call rejects a missing method", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.throws(
    () => parseInvokeArgs(["call"]),
    (error) => error.code === "INVALID_ARGUMENTS" && Boolean(error.details?.usage)
  );
});

test("call rejects malformed JSON before connecting", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.throws(() => parseInvokeArgs(["call", "browser.listTabs", "{"], { platform: "linux" }), /JSON/);
});

test("parses an optional timeout", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["call", "browser.listTabs", "{}", "--timeout-ms", "5000"], { platform: "linux" }), {
    mode: "call",
    method: "browser.listTabs",
    params: {},
    timeoutMs: 5000
  });
});

test("parses stdin and file parameter sources without shell JSON", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.deepEqual(parseInvokeArgs(["call", "browser.getTab", "--params-stdin"]), {
    mode: "call",
    method: "browser.getTab",
    paramsInput: { kind: "stdin" }
  });
  assert.deepEqual(parseInvokeArgs(["call", "browser.getTab", "--timeout-ms", "5000", "--params-file", "params.json"]), {
    mode: "call",
    method: "browser.getTab",
    paramsInput: { kind: "file", path: "params.json" },
    timeoutMs: 5000
  });
});

test("rejects mixed or duplicate parameter sources", async () => {
  const { parseInvokeArgs } = await invokeModule();
  for (const argv of [
    ["call", "browser.getTab", "{}", "--params-stdin"],
    ["call", "browser.getTab", "--params-file", "one.json", "--params-file", "two.json"],
    ["call", "browser.getTab", "--params-stdin", "--params-file", "params.json"]
  ]) {
    assert.throws(() => parseInvokeArgs(argv, { platform: "linux" }), (error) => error.code === "INVALID_ARGUMENTS");
  }
});

test("Windows Skill CLI requires stdin or file parameters and supports empty calls", async () => {
  const { parseInvokeArgs } = await invokeModule();
  assert.throws(
    () => parseInvokeArgs(["call", "browser.getTab", '{"tabId":7}'], { platform: "win32" }),
    (error) => error.code === "POWERSHELL_INLINE_JSON_UNSUPPORTED" && /ConvertTo-Json/.test(error.details?.powershell)
  );
  assert.deepEqual(parseInvokeArgs(["call", "browser.endSession"], { platform: "win32" }), {
    mode: "call",
    method: "browser.endSession",
    params: {}
  });
});

test("resolves stdin and file JSON before connecting", async () => {
  const { runInvocation } = await invokeModule();
  const calls = [];
  const dependencies = {
    readStdin: async () => '{"tabId":329033650}',
    readParamsFile: async (file, encoding) => {
      assert.equal(file, "params.json");
      assert.equal(encoding, "utf8");
      return '{"tabId":329033651}';
    },
    connectBridge: async () => ({ call: async (method, params) => { calls.push({ method, params }); return params; } }),
    env: { LINGEE_BROWSER_INSTANCE_ID: "browser-a" }
  };
  assert.deepEqual(
    await runInvocation({ mode: "call", method: "browser.getTab", paramsInput: { kind: "stdin" } }, dependencies),
    { tabId: 329033650 }
  );
  assert.deepEqual(
    await runInvocation({ mode: "call", method: "browser.getTab", paramsInput: { kind: "file", path: "params.json" } }, dependencies),
    { tabId: 329033651 }
  );
  assert.deepEqual(calls, [
    { method: "browser.getTab", params: { tabId: 329033650 } },
    { method: "browser.getTab", params: { tabId: 329033651 } }
  ]);
});

test("malformed stdin JSON fails before instance discovery or connection", async () => {
  const { runInvocation } = await invokeModule();
  let discoveryCalls = 0;
  let connectCalls = 0;
  await assert.rejects(
    () => runInvocation(
      { mode: "call", method: "browser.getTab", paramsInput: { kind: "stdin" } },
      {
        readStdin: async () => '{\\"tabId\\":329033650}',
        listBridgeInstances: async () => { discoveryCalls += 1; return []; },
        connectBridge: async () => { connectCalls += 1; },
        env: {}
      }
    ),
    (error) => error.code === "INVALID_ARGUMENTS" && /standard input/.test(error.message)
  );
  assert.equal(discoveryCalls, 0);
  assert.equal(connectCalls, 0);
});

test("CLI accepts JSON through stdin without argument quoting", async () => {
  await withFixture(async (fixtureRoot) => {
    await writeFile(
      path.join(fixtureRoot, "src", "bridge-client.mjs"),
      "export async function connectBridge() { return { call: async (_method, params) => params }; }\n"
    );
    const result = await runNode(
      [fileURLToPath(invokeUrl), "call", "browser.getTab", "--params-stdin"],
      {
        env: { ...process.env, LINGEE_BROWSER_BRIDGE_ROOT: fixtureRoot, LINGEE_BROWSER_INSTANCE_ID: "browser-a" },
        input: '{"tabId":329033650}'
      }
    );
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), { tabId: 329033650 });
  });
});

test("delegates instance discovery to the Bridge Client", async () => {
  const { runInvocation } = await invokeModule();
  const instances = [{ instanceId: "browser-a", startedAt: "2026-07-27T00:00:00.000Z" }];
  let loadCalls = 0;
  const deps = {
    loadClient: async () => {
      loadCalls += 1;
      return { connectBridge: deps.connectBridge, listBridgeInstances: deps.listBridgeInstances };
    },
    connectBridge: async () => assert.fail("instances must not connect"),
    listBridgeInstances: async () => instances
  };

  assert.deepEqual(await runInvocation({ mode: "instances" }, deps), instances);
  assert.equal(loadCalls, 0);
});

test("CLI instance discovery exposes only stable public descriptor fields", async () => {
  await withFixture(async (fixtureRoot) => {
    await writeFile(
      path.join(fixtureRoot, "src", "bridge-client.mjs"),
      `export async function listBridgeInstances() {
        return [{
          instanceId: "browser-a",
          pid: 1234,
          transport: "local-pipe",
          nativeHostName: "com.lingee.app.browser_agent_bridge",
          startedAt: "2026-07-27T00:00:00.000Z",
          endpoint: "private-endpoint",
          token: "top-level-secret",
          diagnostics: { token: "nested-secret", futureField: true },
          futureField: "future-secret",
          schemaVersion: 99
        }];
      }\n`
    );

    const result = await runNode([fileURLToPath(invokeUrl), "instances"], {
      env: { ...process.env, LINGEE_BROWSER_BRIDGE_ROOT: fixtureRoot }
    });

    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.deepEqual(JSON.parse(result.stdout), [{
      instanceId: "browser-a",
      pid: 1234,
      transport: "local-pipe",
      nativeHostName: "com.lingee.app.browser_agent_bridge",
      startedAt: "2026-07-27T00:00:00.000Z"
    }]);
    assert.doesNotMatch(result.stdout, /secret|token|endpoint|futureField|schemaVersion/);
  });
});

test("delegates calls with exact arguments and timeout forwarding", async () => {
  const { runInvocation } = await invokeModule();
  const expectedResult = [{ id: 7, title: "Docs" }];
  const connectionOptions = [];
  const calls = [];
  const deps = {
    loadClient: async () => assert.fail("injected methods must avoid loading a client"),
    connectBridge: async (options) => {
      connectionOptions.push(options);
      return {
        call: async (method, params, options) => {
          calls.push({ method, params, options });
          return expectedResult;
        }
      };
    },
    listBridgeInstances: async () => [{ instanceId: "browser-a" }],
    env: { LINGEE_BROWSER_INSTANCE_ID: "browser-a" }
  };

  assert.deepEqual(
    await runInvocation(
      { mode: "call", method: "browser.listTabs", params: {}, timeoutMs: 5000 },
      deps
    ),
    expectedResult
  );
  assert.deepEqual(connectionOptions, [{ instanceId: "browser-a", timeoutMs: 5000 }]);
  assert.deepEqual(calls, [{ method: "browser.listTabs", params: {}, options: { timeoutMs: 5000 } }]);
});

test("Skill CLI accepts every method in the shared standard registry", async () => {
  const { runInvocation } = await invokeModule();
  const calls = [];
  const deps = {
    connectBridge: async () => ({
      call: async (method, params) => {
        calls.push({ method, params });
        return method;
      }
    }),
    env: { LINGEE_BROWSER_INSTANCE_ID: "browser-a" }
  };

  for (const method of STANDARD_BRIDGE_METHODS) {
    assert.equal(
      await runInvocation({ mode: "call", method, params: { registryProbe: true } }, deps),
      method
    );
  }
  assert.deepEqual(calls.map(({ method }) => method), [...STANDARD_BRIDGE_METHODS]);
});

test("Skill CLI blocks nonstandard browser control before discovery or connection", async () => {
  const { runInvocation } = await invokeModule();
  for (const method of ["browser.cdp", "policy.allowCdpMethod", "Runtime.evaluate", "browser.unknownFutureEscapeHatch"]) {
    let discoveryCalls = 0;
    let connectCalls = 0;
    await assert.rejects(
      () => runInvocation(
        { mode: "call", method, params: {} },
        {
          connectBridge: async () => { connectCalls += 1; },
          listBridgeInstances: async () => { discoveryCalls += 1; return []; },
          env: {}
        }
      ),
      (error) => error.code === "NONSTANDARD_BROWSER_CONTROL_BLOCKED"
        && error.details?.method === method
        && Array.isArray(error.details?.suggestions)
    );
    assert.equal(discoveryCalls, 0, `${method} is blocked before instance discovery`);
    assert.equal(connectCalls, 0, `${method} is blocked before bridge connection`);
  }
});

test("Skill CLI saves screenshot bytes without printing base64", async () => {
  const { runInvocation } = await invokeModule();
  let written;
  const result = await runInvocation(
    { mode: "call", method: "browser.screenshot", params: { tabId: 7 }, saveScreenshot: "shot.png" },
    {
      connectBridge: async () => ({ call: async () => ({ data: Buffer.from("png-bytes").toString("base64"), mimeType: "image/png", observationId: "obs-1" }) }),
      writeScreenshot: async (file, bytes) => { written = { file, bytes: bytes.toString() }; },
      env: { LINGEE_BROWSER_INSTANCE_ID: "browser-a" }
    }
  );
  assert.deepEqual(written, { file: "shot.png", bytes: "png-bytes" });
  assert.deepEqual(result, { mimeType: "image/png", observationId: "obs-1", path: "shot.png", bytes: 9 });
  assert.equal(Object.hasOwn(result, "data"), false);
});

test("call refuses to guess when multiple bridge instances are running", async () => {
  const { runInvocation } = await invokeModule();
  let connectCalls = 0;
  await assert.rejects(
    () => runInvocation(
      { mode: "call", method: "bridge.getInfo", params: {} },
      {
        connectBridge: async () => { connectCalls += 1; },
        listBridgeInstances: async () => [{ instanceId: "browser-a" }, { instanceId: "browser-b" }],
        env: {}
      }
    ),
    (error) => error.code === "BRIDGE_INSTANCE_SELECTION_REQUIRED"
      && error.details?.instanceIds?.join(",") === "browser-a,browser-b"
  );
  assert.equal(connectCalls, 0);
});

test("normalizes Bridge Client errors without contacting a browser", async () => {
  const { runInvocation } = await invokeModule();
  const bridgeError = Object.assign(new Error("Bridge unavailable"), {
    code: "BRIDGE_NOT_FOUND",
    data: { recovery: "Open the browser" }
  });
  await assert.rejects(
    () => runInvocation(
      { mode: "call", method: "bridge.getInfo", params: {} },
      {
        loadClient: async () => assert.fail("injected connection must avoid loading a client"),
        connectBridge: async () => { throw bridgeError; },
        listBridgeInstances: async () => []
      }
    ),
    (error) => error.code === "BRIDGE_NOT_FOUND" && error.details?.recovery === "Open the browser"
  );
});

test("CLI writes one JSON value when a Bridge Client call returns undefined", async () => {
  await withFixture(async (fixtureRoot) => {
    await writeFile(
      path.join(fixtureRoot, "src", "bridge-client.mjs"),
      "export async function listBridgeInstances() { return [{ instanceId: 'browser-a' }]; }\n"
        + "export async function connectBridge() { return { call: async () => undefined }; }\n"
    );
    const result = await runNode([fileURLToPath(invokeUrl), "call", "bridge.getInfo"], {
      env: { ...process.env, LINGEE_BROWSER_BRIDGE_ROOT: fixtureRoot }
    });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, "null\n");
  });
});

test("CLI failure exits nonzero with empty stdout and one JSON line on stderr", async () => {
  await withFixture(async (fixtureRoot) => {
    await writeFile(
      path.join(fixtureRoot, "src", "bridge-client.mjs"),
      `export async function listBridgeInstances() { return [{ instanceId: "browser-a" }]; }
      export async function connectBridge() {
        const error = Object.assign(new Error("Bridge unavailable"), {
          code: "BRIDGE_NOT_FOUND",
          data: { recovery: "Open the browser" }
        });
        throw error;
      }\n`
    );
    const result = await runNode(
      [fileURLToPath(invokeUrl), "call", "bridge.getInfo"],
      { env: { ...process.env, LINGEE_BROWSER_BRIDGE_ROOT: fixtureRoot } }
    );

    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, "");
    const lines = result.stderr.split(/\r?\n/).filter(Boolean);
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), {
      error: "Bridge unavailable",
      code: "BRIDGE_NOT_FOUND",
      details: { recovery: "Open the browser" }
    });
  });
});
