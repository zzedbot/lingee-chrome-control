#!/usr/bin/env node
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const HOST_NAME = "com.lingee.app.browser_agent_bridge";
const execFileAsync = promisify(execFile);
if (process.platform !== "win32") throw new Error("The bundled Native Host uninstaller currently supports Windows only.");
const dataDir = dataDirectory();
const expectedLeaf = path.basename(dataDir).toLowerCase();
if (expectedLeaf !== "browseragentbridge" || path.basename(path.dirname(dataDir)).toLowerCase() !== "lingee") throw new Error("Refusing to remove an unexpected Bridge data directory.");

await execFileAsync("reg", ["delete", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, "/f"], { windowsHide: true }).catch(() => {});
await fs.rm(path.join(dataDir, `${HOST_NAME}.json`), { force: true });
await fs.rm(path.join(dataDir, "bin"), { recursive: true, force: true });
await fs.rm(path.join(dataDir, "runtime"), { recursive: true, force: true });
process.stdout.write(`${JSON.stringify({ ok: true, removedHost: true, policyPreserved: true, restartBrowser: true })}\n`);

function dataDirectory() {
  if (process.env.LINGEE_BROWSER_BRIDGE_HOME) return path.resolve(process.env.LINGEE_BROWSER_BRIDGE_HOME);
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Lingee", "BrowserAgentBridge");
}
