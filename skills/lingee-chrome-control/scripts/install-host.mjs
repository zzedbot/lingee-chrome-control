#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const HOST_NAME = "org.universal_browser.bridge";
const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
if (!args.extensionId || !/^[a-p]{32}$/.test(args.extensionId)) {
  process.stderr.write("Usage: node <skill-root>/scripts/install-host.mjs --extension-id <32-character-id> [--dry-run]\n");
  process.exit(2);
}
if (process.platform !== "win32") throw coded("PLATFORM_NOT_BUNDLED", "The bundled Native Host executable currently supports Windows only.");

const source = path.resolve(import.meta.dirname, "../assets/native-host/universal-browser-host.exe");
const dataDir = dataDirectory();
const installDir = safeChild(dataDir, "bin");
const bytes = await fs.readFile(source);
const digest = createHash("sha256").update(bytes).digest("hex");
const target = safeChild(installDir, `universal-browser-host-${digest.slice(0, 16)}.exe`);
const manifestPath = safeChild(dataDir, `${HOST_NAME}.json`);
const manifest = {
  name: HOST_NAME,
  description: "Lingee Chrome Agent Bridge native messaging host",
  path: target,
  type: "stdio",
  allowed_origins: [`chrome-extension://${args.extensionId}/`]
};

if (!args.dryRun) {
  await fs.mkdir(installDir, { recursive: true });
  await fs.copyFile(source, target, constants.COPYFILE_EXCL).catch(async (error) => {
    if (error.code !== "EEXIST") throw error;
  });
  const installedHash = createHash("sha256").update(await fs.readFile(target)).digest("hex");
  if (installedHash !== digest) throw coded("HOST_HASH_MISMATCH", "Installed Native Host hash does not match the bundled executable.");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await execFileAsync("reg", ["add", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { windowsHide: true });
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  dryRun: args.dryRun,
  hostName: HOST_NAME,
  extensionId: args.extensionId,
  executable: target,
  manifest: manifestPath,
  sha256: digest,
  nextAction: args.dryRun ? "Run again without --dry-run to install." : "Restart Chrome, then run preflight.mjs."
})}\n`);

function dataDirectory() {
  if (process.env.UNIVERSAL_BROWSER_BRIDGE_HOME) return path.resolve(process.env.UNIVERSAL_BROWSER_BRIDGE_HOME);
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "UniversalBrowserBridge");
}

function safeChild(parent, child) {
  const parentPath = path.resolve(parent);
  const targetPath = path.resolve(parentPath, child);
  if (targetPath !== parentPath && !targetPath.startsWith(`${parentPath}${path.sep}`)) throw coded("UNSAFE_INSTALL_PATH", "Resolved install path escaped the Bridge data directory.");
  return targetPath;
}

function parseArgs(values) {
  const result = { dryRun: false };
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--extension-id") result.extensionId = values[++index];
    else if (values[index] === "--dry-run") result.dryRun = true;
    else throw coded("INVALID_ARGUMENTS", `Unknown argument: ${values[index]}`);
  }
  return result;
}

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}
