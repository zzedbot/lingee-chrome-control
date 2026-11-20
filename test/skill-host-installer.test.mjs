import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("standalone Skill installer dry-run requires system Node and plans the lightweight launcher", async (t) => {
  if (process.platform !== "win32") return t.skip("Windows installer test");
  const taskDir = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-skill-installer-test-"));
  t.after(() => fs.rm(taskDir, { recursive: true, force: true }));
  const script = path.resolve("skills", "lingee-browser-control", "scripts", "install-host.mjs");
  const report = await runJson(process.execPath, [script, "--extension-id", "haibmamedieblhbonifchcedcbbfgini", "--dry-run"], {
    ...process.env,
    LINGEE_BROWSER_BRIDGE_HOME: taskDir
  });

  assert.equal(report.ok, true);
  assert.equal(report.dryRun, true);
  assert.equal(report.runtime, "system-node");
  assert.equal(report.node, process.execPath);
  assert.ok(report.minimumNodeMajor >= 22);
  assert.match(report.launcher, /native-host-launcher\.exe$/i);
  assert.match(report.hostScript, /native-host\.cjs$/i);
  assert.equal(await exists(path.join(taskDir, "bin")), false, "dry-run does not install files");
  assert.equal(await exists(report.manifest), false, "dry-run does not write a manifest");
});

function runJson(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`installer exited ${code}: ${stderr}`));
      try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); }
    });
  });
}

async function exists(value) {
  try { await fs.access(value); return true; } catch { return false; }
}
