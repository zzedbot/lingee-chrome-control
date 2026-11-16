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
const MINIMUM_NODE_MAJOR = 22;
const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv.slice(2));
if (!args.extensionId || !/^[a-p]{32}$/.test(args.extensionId)) {
  process.stderr.write("Usage: node <skill-root>/scripts/install-host.mjs --extension-id <32-character-id> [--dry-run]\n");
  process.exit(2);
}
if (process.platform !== "win32") throw coded("PLATFORM_NOT_BUNDLED", "The bundled Native Host launcher currently supports Windows only.");

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isSafeInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
  throw coded("NODE_VERSION_UNSUPPORTED", `Node.js ${MINIMUM_NODE_MAJOR} or newer is required; current version is ${process.version}.`);
}

const sourceDir = path.resolve(import.meta.dirname, "../assets/native-host");
const sourceLauncher = safeChild(sourceDir, "native-host-launcher.exe");
const sourceHost = safeChild(sourceDir, "native-host.cjs");
const [launcherBytes, hostBytes] = await Promise.all([fs.readFile(sourceLauncher), fs.readFile(sourceHost)]);
const launcherHash = sha256(launcherBytes);
const hostHash = sha256(hostBytes);
const releaseHash = createHash("sha256").update(launcherHash).update("\0").update(hostHash).digest("hex");

const dataDir = dataDirectory();
const installDir = safeChild(safeChild(dataDir, "bin"), `host-${releaseHash.slice(0, 16)}`);
const targetLauncher = safeChild(installDir, "native-host-launcher.exe");
const targetHost = safeChild(installDir, "native-host.cjs");
const targetNodePath = safeChild(installDir, "node-path.txt");
const manifestPath = safeChild(dataDir, `${HOST_NAME}.json`);
const manifest = {
  name: HOST_NAME,
  description: "Lingee Chrome Agent Bridge native messaging host (system Node.js)",
  path: targetLauncher,
  type: "stdio",
  allowed_origins: [`chrome-extension://${args.extensionId}/`]
};

if (!args.dryRun) {
  await fs.mkdir(installDir, { recursive: true });
  await copyVerified(sourceLauncher, targetLauncher, launcherHash);
  await copyVerified(sourceHost, targetHost, hostHash);
  await fs.writeFile(targetNodePath, `${process.execPath}\n`, { encoding: "utf8", mode: 0o600 });
  const installedNodePath = (await fs.readFile(targetNodePath, "utf8")).trim();
  if (installedNodePath !== process.execPath) throw coded("HOST_HASH_MISMATCH", "Installed Node.js path does not match the validated runtime.");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await execFileAsync("reg", ["add", `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { windowsHide: true });
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  dryRun: args.dryRun,
  hostName: HOST_NAME,
  extensionId: args.extensionId,
  runtime: "system-node",
  node: process.execPath,
  nodeVersion: process.version,
  minimumNodeMajor: MINIMUM_NODE_MAJOR,
  launcher: targetLauncher,
  hostScript: targetHost,
  manifest: manifestPath,
  launcherSha256: launcherHash,
  hostScriptSha256: hostHash,
  nextAction: args.dryRun ? "Run again without --dry-run to install." : "Restart Chrome, then run preflight.mjs."
})}\n`);

async function copyVerified(source, target, expectedHash) {
  await fs.copyFile(source, target, constants.COPYFILE_EXCL).catch(async (error) => {
    if (error.code !== "EEXIST") throw error;
  });
  if (sha256(await fs.readFile(target)) !== expectedHash) throw coded("HOST_HASH_MISMATCH", `Installed Native Host file hash does not match: ${path.basename(target)}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function dataDirectory() {
  if (process.env.UNIVERSAL_BROWSER_BRIDGE_HOME) return path.resolve(process.env.UNIVERSAL_BROWSER_BRIDGE_HOME);
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "UniversalBrowserBridge");
}

function safeChild(parent, child) {
  const parentPath = path.resolve(parent);
  const targetPath = path.resolve(parentPath, child);
  if (targetPath !== parentPath && !targetPath.startsWith(`${parentPath}${path.sep}`)) throw coded("UNSAFE_INSTALL_PATH", "Resolved install path escaped its intended directory.");
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
