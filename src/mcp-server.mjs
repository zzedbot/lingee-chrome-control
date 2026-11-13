#!/usr/bin/env node
import readline from "node:readline";
import { connectBridge, listBridgeInstances, toPublicBridgeInstance } from "./bridge-client.mjs";
import { VERSION } from "./version.mjs";
import { STANDARD_CAPABILITIES } from "../skills/lingee-chrome-control/scripts/runtime/standard-capabilities.mjs";

const SERVER_INFO = { name: "lingee-chrome-agent-bridge", version: VERSION };
const TOOLS = STANDARD_CAPABILITIES;
const toolByName = new Map(TOOLS.map((tool) => [tool.name, tool]));
let client;

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on("close", () => { void client?.call("browser.endSession", {}).catch(() => {}); });
input.on("line", async (line) => {
  if (!line.trim()) return;
  let request;
  try {
    request = JSON.parse(line);
    if (request.id == null) return;
    const result = await handleRequest(request);
    write({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    write({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: error.rpcCode || -32000, message: error.message || String(error), data: error.code ? { code: error.code, details: error.data } : undefined } });
  }
});

async function handleRequest(request) {
  switch (request.method) {
    case "initialize":
      return { protocolVersion: request.params?.protocolVersion || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS.map(({ method, imageResult, control, documentation, ...tool }) => tool) };
    case "tools/call":
      return callTool(request.params?.name, request.params?.arguments || {});
    default:
      throw Object.assign(new Error(`Method not found: ${request.method}`), { rpcCode: -32601 });
  }
}

async function callTool(name, args) {
  const tool = toolByName.get(name);
  if (!tool) throw Object.assign(new Error(`Unknown tool: ${name}`), { rpcCode: -32602 });
  try {
    if (name === "bridge_list_instances") {
      return textResult((await listBridgeInstances()).map(toPublicBridgeInstance));
    }
    client ||= await connectBridge({ instanceId: process.env.UNIVERSAL_BROWSER_INSTANCE_ID });
    const result = await client.call(tool.method, args, { timeoutMs: Number(args.timeoutMs) || undefined });
    if (tool.imageResult && result?.data) {
      return { content: [{ type: "image", data: result.data, mimeType: result.mimeType || "image/png" }] };
    }
    return textResult(result);
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: error.message, code: error.code, details: error.data }, null, 2) }] };
  }
}

function textResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function write(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}
