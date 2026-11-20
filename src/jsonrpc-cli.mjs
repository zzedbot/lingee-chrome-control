#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { connectBridge, listBridgeInstances } from "./bridge-client.mjs";

const usage = "lingee-browser-rpc <method> [jsonParams | --params-stdin | --params-file <path>] [--save-screenshot <path>] | lingee-browser-rpc --instances; on Windows use ConvertTo-Json | lingee-browser-rpc <method> --params-stdin, and omit parameters entirely for parameterless methods";
const MAX_PARAMS_BYTES = 1024 * 1024;

export function parseRpcArgs(argv, options = {}) {
  const platform = options.platform ?? process.platform;
  if (argv.length === 1 && argv[0] === "--instances") return { mode: "instances" };
  if (argv.length === 1 && ["-h", "--help"].includes(argv[0])) return { mode: "help" };
  const method = argv[0];
  if (!method || method.startsWith("-")) throw cliError("Invalid invocation arguments.", "INVALID_ARGUMENTS", { usage });
  let params;
  let paramsInput;
  let saveScreenshot;
  for (let index = 1; index < argv.length;) {
    const argument = argv[index];
    if (argument === "--params-stdin") {
      if (params !== undefined || paramsInput !== undefined) throw cliError("Choose exactly one parameter source.", "INVALID_ARGUMENTS", { usage });
      paramsInput = { kind: "stdin" };
      index += 1;
    } else if (argument === "--params-file") {
      if (params !== undefined || paramsInput !== undefined || !argv[index + 1]) throw cliError("Choose exactly one parameter source.", "INVALID_ARGUMENTS", { usage });
      paramsInput = { kind: "file", path: argv[index + 1] };
      index += 2;
    } else if (argument === "--save-screenshot") {
      if (saveScreenshot !== undefined || !argv[index + 1]) throw cliError("Invalid screenshot output path.", "INVALID_ARGUMENTS", { usage });
      saveScreenshot = path.resolve(argv[index + 1]);
      index += 2;
    } else {
      if (argument.startsWith("-") || params !== undefined || paramsInput !== undefined) throw cliError("Invalid invocation arguments.", "INVALID_ARGUMENTS", { usage });
      if (platform === "win32") throw windowsInlineJsonError(method);
      params = parseParamsJson(argument, "inline argument");
      index += 1;
    }
  }
  if (saveScreenshot !== undefined && method !== "browser.screenshot") throw cliError("--save-screenshot is only valid for browser.screenshot.", "INVALID_ARGUMENTS", { usage });
  return { mode: "call", method, ...(paramsInput ? { paramsInput } : { params: params ?? {} }), ...(saveScreenshot ? { saveScreenshot } : {}) };
}

function windowsInlineJsonError(method) {
  return cliError(
    "Inline JSON parameters are disabled on Windows because shell and tool boundaries can alter quoting. Use --params-stdin or --params-file.",
    "POWERSHELL_INLINE_JSON_UNSUPPORTED",
    {
      usage,
      method,
      powershell: `$params | ConvertTo-Json -Depth 10 -Compress | lingee-browser-rpc ${method} --params-stdin`,
      parameterless: `lingee-browser-rpc ${method}`
    }
  );
}

export async function resolveRpcParams(command, dependencies = {}) {
  if (!command.paramsInput) return command.params ?? {};
  if (command.paramsInput.kind === "stdin") {
    return parseParamsJson(await (dependencies.readStdin ?? readStdin)(), "standard input");
  }
  if (command.paramsInput.kind === "file") {
    try {
      const source = await (dependencies.readParamsFile ?? readFile)(command.paramsInput.path, "utf8");
      return parseParamsJson(source, "parameters file");
    } catch (error) {
      if (error?.code === "INVALID_ARGUMENTS") throw error;
      throw cliError(`Unable to read JSON parameters file: ${error.message}`, "PARAMS_INPUT_ERROR", { source: "file" });
    }
  }
  throw cliError("Invalid parameter source.", "INVALID_ARGUMENTS", { usage });
}

function parseParamsJson(source, label) {
  const text = String(source ?? "").replace(/^\uFEFF/, "");
  if (Buffer.byteLength(text, "utf8") > MAX_PARAMS_BYTES) throw cliError(`JSON parameters from ${label} exceed ${MAX_PARAMS_BYTES} bytes.`, "INVALID_ARGUMENTS", { usage });
  try { return JSON.parse(text); }
  catch (error) { throw cliError(`Invalid JSON parameters from ${label}: ${error.message}`, "INVALID_ARGUMENTS", { usage }); }
}

async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > MAX_PARAMS_BYTES) throw cliError(`JSON parameters from standard input exceed ${MAX_PARAMS_BYTES} bytes.`, "INVALID_ARGUMENTS", { usage });
  }
  return text;
}

function cliError(message, code, details) {
  const error = Object.assign(new Error(message), { code });
  if (details !== undefined) error.details = details;
  return error;
}

async function main() {
  try {
    const command = parseRpcArgs(process.argv.slice(2));
    if (command.mode === "help") {
      process.stdout.write(`Usage: ${usage}\n`);
      return;
    }
    if (command.mode === "instances") {
      process.stdout.write(`${JSON.stringify(await listBridgeInstances(), null, 2)}\n`);
      return;
    }
    const params = await resolveRpcParams(command);
    const client = await connectBridge({ instanceId: process.env.LINGEE_BROWSER_INSTANCE_ID });
    let result = await client.call(command.method, params);
    if (command.saveScreenshot) {
      if (!result || typeof result.data !== "string") throw cliError("Bridge returned invalid screenshot data.", "SCREENSHOT_DATA_INVALID");
      const bytes = Buffer.from(result.data, "base64");
      await writeFile(command.saveScreenshot, bytes);
      const { data: _data, ...metadata } = result;
      result = { ...metadata, path: command.saveScreenshot, bytes: bytes.length };
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error.message, code: error.code, details: error.details ?? error.data }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
