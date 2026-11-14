import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STANDARD_CAPABILITIES } from "../skills/lingee-chrome-control/scripts/runtime/standard-capabilities.mjs";
import { CAPABILITY_CASES, coveredMethods } from "./web-fixture/capability-cases.mjs";
import { KDESIGN_COMPONENTS, KDESIGN_PRO_TEMPLATES, OFFICIAL_BASELINE } from "./web-fixture/src/official-catalog.js";
import { COMPONENT_TEST_MATRIX, PRO_TEST_MATRIX } from "./web-fixture/official-test-matrix.mjs";

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
  const source = (await Promise.all(["main.jsx", "KDesignCatalog.jsx", "KDesignProLab.jsx"].map((file) => readFile(path.join(repoRoot, "test", "web-fixture", "src", file), "utf8")))).join("\n");
  for (const testId of [
    "native-click", "native-fill", "native-type", "native-key", "native-check", "native-select", "sequential-input", "double-click", "locator-query-first", "locator-query-hidden", "locator-query-disabled", "coordinate-target", "drag-handle",
    "wheel-zone", "scroll-destination", "file-input", "open-file-chooser", "confirm-dialog", "prompt-dialog", "download-link", "console-log",
    "navigation-link", "full-navigation-link", "redirect-navigation-link", "new-tab-link", "reload-counter", "frame-shell", "cross-frame", "remove-frame", "start-async-target", "open-modal", "open-drawer", "pro-form-submit", "pro-login-submit"
  ]) assert.match(source, new RegExp(`data-testid=[\\"'{]+${testId}`), testId);
});

test("KDesign fixture pins the inspected public component release", async () => {
  const manifest = JSON.parse(await readFile(path.join(repoRoot, "test", "web-fixture", "package.json"), "utf8"));
  assert.equal(manifest.dependencies["@kdcloudjs/kdesign"], "1.8.74");
  assert.equal(manifest.dependencies.react, "17.0.2");
  assert.equal(manifest.dependencies["@kdcloudjs/kdesign-icons"], "1.1.3");
});

test("KDesign fixture mirrors every official demo-bearing component directory", async () => {
  assert.equal(KDESIGN_COMPONENTS.length, 62);
  assert.equal(new Set(KDESIGN_COMPONENTS.map(({ id }) => id)).size, 62);
  assert.ok(KDESIGN_COMPONENTS.every(({ sourcePath }) => /^components\/[a-z0-9-]+\/demo$/.test(sourcePath)));
  assert.equal(OFFICIAL_BASELINE.kdesign.packageVersion, "1.8.74");
  assert.match(OFFICIAL_BASELINE.kdesign.commit, /^[a-f0-9]{40}$/);
  const source = await readFile(path.join(repoRoot, "test", "web-fixture", "src", "KDesignCatalog.jsx"), "utf8");
  for (const { id } of KDESIGN_COMPONENTS) assert.match(source, new RegExp(`(?:^|\\n)\\s*[\"']?${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\"']?\\s*:`), `missing specimen: ${id}`);
});

test("KDesign Pro fixture mirrors every official main-branch template route", () => {
  assert.equal(KDESIGN_PRO_TEMPLATES.length, 22);
  assert.equal(new Set(KDESIGN_PRO_TEMPLATES.map(({ id }) => id)).size, 22);
  assert.deepEqual(
    Object.fromEntries(["Workbench", "Detail", "List", "Report", "Form", "Exception", "Login"].map((category) => [category, KDESIGN_PRO_TEMPLATES.filter((item) => item.category === category).length])),
    { Workbench: 1, Detail: 5, List: 5, Report: 2, Form: 5, Exception: 3, Login: 1 }
  );
  assert.match(OFFICIAL_BASELINE.kdesignPro.commit, /^[a-f0-9]{40}$/);
});

test("official KDesign test matrix covers every component and Pro page exactly once", () => {
  assert.deepEqual(Object.keys(COMPONENT_TEST_MATRIX).sort(), KDESIGN_COMPONENTS.map(({ id }) => id).sort());
  assert.deepEqual(Object.keys(PRO_TEST_MATRIX).sort(), KDESIGN_PRO_TEMPLATES.map(({ id }) => id).sort());
  for (const [id, entry] of Object.entries(COMPONENT_TEST_MATRIX)) {
    assert.match(entry.tier, /^(structure|interaction)$/i, id);
    assert.ok((entry.expectedText?.length || 0) + (entry.minCss ? 1 : 0) + (entry.minRole ? 1 : 0) > 0, id);
  }
  for (const [id, entry] of Object.entries(PRO_TEST_MATRIX)) {
    assert.match(entry.tier, /^(structure|interaction)$/i, id);
    assert.ok(entry.expectedText?.length > 0, id);
  }
});
