import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { parseRpcArgs, resolveRpcParams } from "../src/jsonrpc-cli.mjs";

test("RPC CLI parses inline, stdin, and file parameter sources", () => {
  assert.deepEqual(parseRpcArgs(["browser.getTab", '{"tabId":7}'], { platform: "linux" }), {
    mode: "call",
    method: "browser.getTab",
    params: { tabId: 7 }
  });
  assert.deepEqual(parseRpcArgs(["browser.getTab", "--params-stdin"]), {
    mode: "call",
    method: "browser.getTab",
    paramsInput: { kind: "stdin" }
  });
  assert.deepEqual(parseRpcArgs(["browser.getTab", "--params-file", "params.json"]), {
    mode: "call",
    method: "browser.getTab",
    paramsInput: { kind: "file", path: "params.json" }
  });
});

test("RPC CLI rejects mixed parameter sources", () => {
  assert.throws(
    () => parseRpcArgs(["browser.getTab", "{}", "--params-stdin"], { platform: "linux" }),
    (error) => error.code === "INVALID_ARGUMENTS"
  );
});

test("RPC CLI disables inline JSON on Windows and accepts parameterless calls", () => {
  assert.throws(
    () => parseRpcArgs(["browser.getTab", '{"tabId":7}'], { platform: "win32" }),
    (error) => error.code === "POWERSHELL_INLINE_JSON_UNSUPPORTED" && /ConvertTo-Json/.test(error.details.powershell)
  );
  assert.deepEqual(parseRpcArgs(["browser.endSession"], { platform: "win32" }), {
    mode: "call",
    method: "browser.endSession",
    params: {}
  });
});

test("RPC CLI accepts screenshot file output only for screenshots", () => {
  const output = path.resolve("shot.png");
  assert.deepEqual(parseRpcArgs(["browser.screenshot", "{}", "--save-screenshot", "shot.png"], { platform: "linux" }), {
    mode: "call", method: "browser.screenshot", params: {}, saveScreenshot: output
  });
  assert.throws(() => parseRpcArgs(["browser.getTab", "{}", "--save-screenshot", "shot.png"], { platform: "linux" }), { code: "INVALID_ARGUMENTS" });
});

test("RPC CLI resolves stdin and file parameters without shell quoting", async () => {
  assert.deepEqual(
    await resolveRpcParams(
      { paramsInput: { kind: "stdin" } },
      { readStdin: async () => '{"tabId":329033650}' }
    ),
    { tabId: 329033650 }
  );
  assert.deepEqual(
    await resolveRpcParams(
      { paramsInput: { kind: "file", path: "params.json" } },
      { readParamsFile: async () => '\uFEFF{"tabId":329033651}' }
    ),
    { tabId: 329033651 }
  );
});

test("RPC CLI reports malformed escaped JSON deterministically", async () => {
  await assert.rejects(
    () => resolveRpcParams(
      { paramsInput: { kind: "stdin" } },
      { readStdin: async () => '{\\"tabId\\":329033650}' }
    ),
    (error) => error.code === "INVALID_ARGUMENTS" && /standard input/.test(error.message)
  );
});
