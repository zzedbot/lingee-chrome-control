import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");
const bundle = path.join(dist, "native-host.cjs");
const launcher = path.join(dist, "native-host-launcher.exe");
const launcherSource = path.join(root, "scripts", "native-host-launcher.cs");
const nodePathFile = path.join(dist, "node-path.txt");

if (process.platform !== "win32") throw new Error("The distributable launcher is currently built for Windows only.");
await fs.mkdir(dist, { recursive: true });
await build({ entryPoints: [path.join(root, "src", "native-host.mjs")], outfile: bundle, bundle: true, platform: "node", format: "cjs", target: "node22", minify: false });

const csc = await findCsc();
await execFileAsync(csc, ["/nologo", "/target:exe", "/optimize+", `/out:${launcher}`, launcherSource], { cwd: root, windowsHide: true });
await fs.writeFile(nodePathFile, `${process.execPath}\n`, "utf8");

for (const obsolete of ["native-host.blob", "sea-config.json", "universal-browser-host.exe", "universal-browser-host"]) {
  await fs.rm(path.join(dist, obsolete), { force: true });
}

const [bundleStat, launcherStat] = await Promise.all([fs.stat(bundle), fs.stat(launcher)]);
process.stdout.write(`${JSON.stringify({
  ok: true,
  hostScript: bundle,
  hostScriptBytes: bundleStat.size,
  launcher,
  launcherBytes: launcherStat.size,
  node: process.execPath,
  nodeVersion: process.version
})}\n`);

async function findCsc() {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const candidates = [
    path.join(systemRoot, "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
    path.join(systemRoot, "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe")
  ];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { }
  }
  throw new Error("Windows .NET Framework C# compiler was not found; install .NET Framework 4.x developer tools to build the launcher.");
}
