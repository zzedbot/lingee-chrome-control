#!/usr/bin/env node
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STANDARD_BRIDGE_METHODS, STANDARD_CAPABILITIES } from "./runtime/standard-capabilities.mjs";

const SKILL_NAME = "lingee-browser-control";
const SKILL_VERSION = "0.2.2";
const usage = "node invoke.mjs info | methods | describe <method> | instances | call <method> [jsonParams | --params-stdin | --params-file <path>] [--timeout-ms <ms>] [--save-screenshot <path>]; on Windows always use ConvertTo-Json | --params-stdin or --params-file, and omit parameters for parameterless methods; set LINGEE_BROWSER_SESSION_ID for a stable CLI control session";
const MAX_PARAMS_BYTES = 1024 * 1024;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const bundledClientUrl = new URL("./runtime/bridge-client.mjs", import.meta.url);
export async function locateBridgeRoot(options = {}) {
  const env = options.env ?? process.env;
  const searched = [];
  const explicitRoot = env.LINGEE_BROWSER_BRIDGE_ROOT;

  if (explicitRoot) {
    const root = path.resolve(explicitRoot);
    searched.push(root);
    if (await isBridgeRoot(root)) return root;
    throw structuredError(
      `Lingee Browser bridge root is not valid: ${root}`,
      "BRIDGE_ROOT_NOT_FOUND",
      { searched }
    );
  }

  for (const start of [options.scriptDir ?? scriptDir, options.cwd ?? process.cwd()]) {
    const root = await findBridgeRoot(path.resolve(start), searched);
    if (root) return root;
  }

  throw structuredError(
    "Lingee Browser bridge project was not found.",
    "BRIDGE_ROOT_NOT_FOUND",
    { searched }
  );
}

export function parseInvokeArgs(argv, options = {}) {
  const platform = options.platform ?? process.platform;
  if (argv.length === 0 || (argv.length === 1 && ["help", "-h", "--help"].includes(argv[0]))) return { mode: "help" };
  if (argv.length === 1 && argv[0] === "info") return { mode: "info" };
  if (argv.length === 1 && argv[0] === "methods") return { mode: "methods" };
  if (argv.length === 2 && argv[0] === "describe" && argv[1]) return { mode: "describe", method: argv[1] };
  if (argv.length === 1 && argv[0] === "instances") return { mode: "instances" };
  if (argv[0] !== "call") throw invalidArguments();

  const method = argv[1];
  if (!method || method.startsWith("-")) throw invalidArguments();

  let index = 2;
  let params;
  let paramsInput;
  let timeoutMs;
  let saveScreenshot;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === "--params-stdin") {
      if (params !== undefined || paramsInput !== undefined) throw invalidArguments();
      paramsInput = { kind: "stdin" };
      index += 1;
      continue;
    }
    if (argument === "--params-file") {
      if (params !== undefined || paramsInput !== undefined || !argv[index + 1]) throw invalidArguments();
      paramsInput = { kind: "file", path: argv[index + 1] };
      index += 2;
      continue;
    }
    if (argument === "--timeout-ms") {
      if (timeoutMs !== undefined) throw invalidArguments();
      timeoutMs = Number(argv[index + 1]);
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw invalidArguments();
      index += 2;
      continue;
    }
    if (argument === "--save-screenshot") {
      if (saveScreenshot !== undefined || !argv[index + 1]) throw invalidArguments();
      saveScreenshot = path.resolve(argv[index + 1]);
      index += 2;
      continue;
    }
    if (argument.startsWith("-") || params !== undefined || paramsInput !== undefined) throw invalidArguments();
    if (platform === "win32") throw windowsInlineJsonError(method);
    params = parseParamsJson(argument, "inline argument");
    index += 1;
  }

  const invocation = {
    mode: "call",
    method,
    ...(paramsInput === undefined ? { params: params ?? {} } : { paramsInput })
  };
  if (timeoutMs !== undefined) invocation.timeoutMs = timeoutMs;
  if (saveScreenshot !== undefined) {
    if (method !== "browser.screenshot") throw structuredError("--save-screenshot is only valid for browser.screenshot.", "INVALID_ARGUMENTS", { usage });
    invocation.saveScreenshot = saveScreenshot;
  }
  return invocation;
}

function windowsInlineJsonError(method) {
  return structuredError(
    "Inline JSON parameters are disabled on Windows because shell and tool boundaries can alter quoting. Use --params-stdin or --params-file.",
    "POWERSHELL_INLINE_JSON_UNSUPPORTED",
    {
      usage,
      method,
      powershell: `$params | ConvertTo-Json -Depth 10 -Compress | node invoke.mjs call ${method} --params-stdin`,
      parameterless: `node invoke.mjs call ${method}`
    }
  );
}

export async function runInvocation(invocation, dependencies = {}) {
  try {
    if (invocation?.mode === "help") return { usage };
    if (invocation?.mode === "info") return { name: SKILL_NAME, version: SKILL_VERSION, skillRoot: path.dirname(scriptDir), entrypoint: fileURLToPath(import.meta.url) };
    if (invocation?.mode === "methods") return STANDARD_CAPABILITIES.filter(({ method }) => method).map(({ method, name, description }) => ({ method, tool: name, description }));
    if (invocation?.mode === "describe") {
      const entry = STANDARD_CAPABILITIES.find(({ method }) => method === invocation.method);
      if (!entry) throw unsupportedMethod(invocation.method);
      return { method: entry.method, tool: entry.name, description: entry.description, inputSchema: entry.inputSchema, documentation: entry.documentation };
    }
    if (invocation?.mode === "instances") {
      const listBridgeInstances = await resolveClientFunction("listBridgeInstances", dependencies);
      return (await listBridgeInstances()).map(toPublicBridgeInstance);
    }
    if (invocation?.mode !== "call" || !invocation.method) throw invalidArguments();
    if (!STANDARD_BRIDGE_METHODS.has(invocation.method)) {
      throw unsupportedMethod(invocation.method);
    }

    const params = await resolveInvocationParams(invocation, dependencies);

    const connectBridge = await resolveClientFunction("connectBridge", dependencies);
    const env = dependencies.env ?? process.env;
    let instanceId = env.LINGEE_BROWSER_INSTANCE_ID;
    if (!instanceId) {
      const listBridgeInstances = await resolveClientFunction("listBridgeInstances", dependencies);
      const instances = await listBridgeInstances();
      if (!Array.isArray(instances)) {
        throw structuredError("Bridge Client returned invalid instances.", "BRIDGE_INSTANCES_INVALID");
      }
      if (instances.length > 1) {
        throw structuredError(
          "Multiple Lingee Browser bridge instances are running; select one explicitly.",
          "BRIDGE_INSTANCE_SELECTION_REQUIRED",
          { instanceIds: instances.map(({ instanceId: id }) => id).filter((id) => typeof id === "string") }
        );
      }
      instanceId = instances[0]?.instanceId;
    }
    const client = await connectBridge({
      instanceId,
      ...(env.LINGEE_BROWSER_SESSION_ID ? { sessionId: env.LINGEE_BROWSER_SESSION_ID } : {}),
      ...(invocation.timeoutMs === undefined ? {} : { timeoutMs: invocation.timeoutMs })
    });
    const result = await client.call(
      invocation.method,
      params,
      invocation.timeoutMs === undefined ? undefined : { timeoutMs: invocation.timeoutMs }
    );
    if (invocation.saveScreenshot) return saveScreenshotResult(result, invocation.saveScreenshot, dependencies);
    return result;
  } catch (error) {
    throw normalizeError(error);
  }
}

async function saveScreenshotResult(result, outputPath, dependencies = {}) {
  if (!result || typeof result.data !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.data)) {
    throw structuredError("Bridge returned invalid screenshot data.", "SCREENSHOT_DATA_INVALID");
  }
  const bytes = Buffer.from(result.data, "base64");
  await (dependencies.writeScreenshot ?? writeFile)(outputPath, bytes);
  const { data: _data, ...metadata } = result;
  return { ...metadata, path: outputPath, bytes: bytes.length };
}

function unsupportedMethod(method) {
  const suggestions = [...STANDARD_BRIDGE_METHODS]
    .map((candidate) => ({ candidate, distance: editDistance(String(method || ""), candidate) }))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, 3)
    .map(({ candidate }) => candidate);
  return structuredError(
    `The Skill standard-control surface does not allow Bridge method: ${method}`,
    "NONSTANDARD_BROWSER_CONTROL_BLOCKED",
    { method, suggestions }
  );
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}

export async function resolveInvocationParams(invocation, dependencies = {}) {
  if (!invocation?.paramsInput) return invocation?.params ?? {};
  const input = invocation.paramsInput;
  let source;
  if (input.kind === "stdin") {
    source = await (dependencies.readStdin ?? readStdin)();
    return parseParamsJson(source, "standard input");
  }
  if (input.kind === "file" && typeof input.path === "string" && input.path) {
    try {
      source = await (dependencies.readParamsFile ?? readFile)(input.path, "utf8");
    } catch (error) {
      throw structuredError(`Unable to read JSON parameters file: ${error.message}`, "PARAMS_INPUT_ERROR", { source: "file" });
    }
    return parseParamsJson(source, "parameters file");
  }
  throw invalidArguments();
}

function parseParamsJson(source, label) {
  const text = String(source ?? "").replace(/^\uFEFF/, "");
  if (Buffer.byteLength(text, "utf8") > MAX_PARAMS_BYTES) {
    throw structuredError(`JSON parameters from ${label} exceed ${MAX_PARAMS_BYTES} bytes.`, "INVALID_ARGUMENTS", { usage });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw structuredError(`Invalid JSON parameters from ${label}: ${error.message}`, "INVALID_ARGUMENTS", { usage });
  }
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > MAX_PARAMS_BYTES) {
      throw structuredError(`JSON parameters from standard input exceed ${MAX_PARAMS_BYTES} bytes.`, "INVALID_ARGUMENTS", { usage });
    }
  }
  return text;
}

function toPublicBridgeInstance(descriptor) {
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

export async function loadClient(bridgeRoot) {
  const clientPath = path.join(bridgeRoot, "src", "bridge-client.mjs");
  return import(pathToFileURL(clientPath).href);
}

export async function loadBundledClient() {
  try {
    return await import(bundledClientUrl.href);
  } catch {
    throw structuredError(
      "The bundled Lingee Browser Bridge Client is unavailable.",
      "BRIDGE_CLIENT_UNAVAILABLE"
    );
  }
}

export async function resolveClient(options = {}) {
  const env = options.env ?? process.env;
  if (env.LINGEE_BROWSER_BRIDGE_ROOT) {
    const bridgeRoot = await locateBridgeRoot({ env });
    return { client: await (options.loadClient ?? loadClient)(bridgeRoot), source: "repository" };
  }
  return { client: await (options.loadBundledClient ?? loadBundledClient)(), source: "bundled" };
}

export function normalizeError(error) {
  if (error instanceof Error && error.details !== undefined) return error;
  const message = error?.message ?? error?.error ?? String(error);
  return structuredError(message, error?.code ?? "INVOCATION_FAILED", error?.details ?? error?.data);
}

async function findBridgeRoot(start, searched) {
  let current = start;
  while (true) {
    searched.push(current);
    if (await isBridgeRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function isBridgeRoot(root) {
  try {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    if (manifest.name !== "lingee-browser-agent-bridge") return false;
    await access(path.join(root, "src", "bridge-client.mjs"));
    return true;
  } catch {
    return false;
  }
}

async function resolveClientFunction(name, dependencies) {
  if (typeof dependencies[name] === "function") return dependencies[name];
  const resolved = await (dependencies.resolveClient ?? resolveClient)({
    env: dependencies.env,
    loadClient: dependencies.loadClient,
    loadBundledClient: dependencies.loadBundledClient
  });
  const client = resolved?.client ?? resolved;
  if (typeof client[name] !== "function") {
    throw structuredError(`Bridge Client does not export ${name}.`, "BRIDGE_CLIENT_UNAVAILABLE");
  }
  return client[name];
}

function invalidArguments() {
  return structuredError("Invalid invocation arguments.", "INVALID_ARGUMENTS", { usage });
}

function structuredError(message, code, details) {
  const error = Object.assign(new Error(message), { error: message, code });
  if (details !== undefined) error.details = details;
  return error;
}

async function main() {
  try {
    const invocation = parseInvokeArgs(process.argv.slice(2));
    const result = await runInvocation(invocation);
    process.stdout.write(`${JSON.stringify(result === undefined ? null : result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(serializeError(normalizeError(error)))}\n`);
    process.exitCode = 1;
  }
}

function serializeError(error) {
  return {
    error: error.message,
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details })
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
