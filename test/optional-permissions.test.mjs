import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  OPTIONAL_SENSITIVE_PERMISSIONS,
  containsOptionalPermission,
  removeOptionalPermission,
  requestOptionalPermission
} from "../extension/optional-permissions.js";

test("history and bookmarks are optional while notifications is absent", async () => {
  const manifest = JSON.parse(await readFile("extension/manifest.json", "utf8"));
  assert.deepEqual([...manifest.optional_permissions].sort(), ["bookmarks", "history"]);
  for (const permission of ["bookmarks", "history", "notifications"]) {
    assert.equal(manifest.permissions.includes(permission), false, `${permission} must not be install-time`);
  }
});

test("optional permission helpers use one narrowly scoped permission", async () => {
  const calls = [];
  const api = {
    contains: async (value) => { calls.push(["contains", value]); return true; },
    request: async (value) => { calls.push(["request", value]); return true; },
    remove: async (value) => { calls.push(["remove", value]); return true; }
  };
  assert.deepEqual(OPTIONAL_SENSITIVE_PERMISSIONS, ["bookmarks", "history"]);
  assert.equal(await containsOptionalPermission(api, "history"), true);
  assert.equal(await requestOptionalPermission(api, "bookmarks"), true);
  assert.equal(await removeOptionalPermission(api, "history"), true);
  assert.deepEqual(calls, [
    ["contains", { permissions: ["history"] }],
    ["request", { permissions: ["bookmarks"] }],
    ["remove", { permissions: ["history"] }]
  ]);
  assert.throws(() => requestOptionalPermission(api, "notifications"), { code: "INVALID_OPTIONAL_PERMISSION" });
});

test("sensitive metadata calls fail closed and settings expose user controls", async () => {
  const [background, optionsHtml, optionsScript] = await Promise.all([
    readFile("extension/background.js", "utf8"),
    readFile("extension/options.html", "utf8"),
    readFile("extension/options.js", "utf8")
  ]);
  assert.match(background, /case "browser\.historySearch":[\s\S]*requireOptionalSensitivePermission\("history"\)/);
  assert.match(background, /case "browser\.bookmarkSearch":[\s\S]*requireOptionalSensitivePermission\("bookmarks"\)/);
  assert.match(background, /OPTIONAL_PERMISSION_REQUIRED/);
  assert.match(optionsHtml, /data-permission="bookmarks"/);
  assert.match(optionsHtml, /data-permission="history"/);
  assert.match(optionsScript, /requestOptionalPermission/);
  assert.match(optionsScript, /removeOptionalPermission/);
});
