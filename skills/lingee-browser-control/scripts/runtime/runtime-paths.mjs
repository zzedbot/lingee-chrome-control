import os from "node:os";
import path from "node:path";

export const HOST_NAME = "com.lingee.app.browser_agent_bridge";

export function dataDirectory() {
  if (process.env.LINGEE_BROWSER_BRIDGE_HOME) return path.resolve(process.env.LINGEE_BROWSER_BRIDGE_HOME);
  if (process.platform === "win32") return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "Lingee", "BrowserAgentBridge");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Lingee", "BrowserAgentBridge");
  return path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "lingee", "browser-agent-bridge");
}

export function runtimeDirectory() {
  return path.join(dataDirectory(), "runtime");
}

export function policyPath() {
  return path.join(dataDirectory(), "policy.json");
}

export function resourceExportDirectory() {
  return path.join(dataDirectory(), "resource-exports");
}
