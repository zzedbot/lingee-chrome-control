import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STANDARD_CAPABILITIES } from "../skills/lingee-chrome-control/scripts/runtime/standard-capabilities.mjs";
import { CAPABILITY_CASES, coveredMethods } from "./web-fixture/capability-cases.mjs";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("web fixture accounts for every standard MCP and CLI capability", () => {
  const expected = new Set(["instances", ...STANDARD_CAPABILITIES.map(({ method }) => method).filter(Boolean)]);
  assert.deepEqual([...coveredMethods()].sort(), [...expected].sort());
  for (const entry of CAPABILITY_CASES) {
    assert.match(entry.mode, /^(runtime|runtime-or-gate|contract)$/);
    assert.ok(entry.case.length >= 12);
  }
});

test("web fixture exposes stable targets for every visible interaction class", async () => {
  const source = await readFile(path.join(repoRoot, "test", "web-fixture", "src", "main.jsx"), "utf8");
  for (const testId of [
    "native-click", "native-fill", "native-type", "native-key", "locator-query-first", "locator-query-hidden", "locator-query-disabled", "coordinate-target", "drag-handle",
    "wheel-zone", "scroll-destination", "file-input", "confirm-dialog", "prompt-dialog", "download-link",
    "navigation-link", "new-tab-link", "reload-counter", "frame-shell", "open-modal", "open-drawer", "pro-form-submit", "pro-login-submit"
  ]) assert.match(source, new RegExp(`data-testid=[\\"'{]+${testId}`), testId);
});

test("KDesign fixture pins the inspected public component release", async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "test", "web-fixture", "package.json"), "utf8"));
  assert.equal(manifest.dependencies["@kdcloudjs/kdesign"], "1.8.74");
  assert.equal(manifest.dependencies.react, "17.0.2");
});
