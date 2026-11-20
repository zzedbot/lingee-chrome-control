import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createResourceExporter, RESOURCE_EXPORT_LIMITS } from "../src/resource-export.mjs";

test("resource exporter writes an inspectable session-temporary ZIP and removes it on release", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-resource-export-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const exporter = createResourceExporter({ rootDirectory: root, now: () => Date.UTC(2026, 10, 14, 12, 0, 0), randomUUID: () => "archive-id" });
  const result = await exporter.exportArchive("session-a", {
    pageUrl: "https://example.test/page",
    documentId: "document-a",
    resources: [
      { resourceId: "r1", url: "https://example.test/app.css", type: "Stylesheet", mimeType: "text/css", content: "body{color:red}", base64Encoded: false },
      { resourceId: "r2", url: "https://example.test/image.png", type: "Image", mimeType: "image/png", content: Buffer.from([1, 2, 3]).toString("base64"), base64Encoded: true }
    ]
  });

  assert.equal(result.resourceCount, 2);
  assert.equal(result.lifecycle, "session-temporary");
  const archive = await fs.readFile(result.path);
  const entries = readStoredZipEntries(archive);
  assert.equal(entries.get("resources/app.css").toString(), "body{color:red}");
  assert.deepEqual([...entries.get("resources/image.png")], [1, 2, 3]);
  const manifest = JSON.parse(entries.get("manifest.json").toString());
  assert.equal(manifest.format, "lingee-observed-resources-v1");
  assert.equal(manifest.pageUrl, "https://example.test/page");
  assert.equal(manifest.resourceCount, 2);

  assert.deepEqual(await exporter.releaseSession("session-a"), { removed: 1 });
  await assert.rejects(fs.access(result.path), { code: "ENOENT" });
});

test("resource exporter rejects unsafe selections and oversized content", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-resource-export-limits-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const exporter = createResourceExporter({ rootDirectory: root });
  const base = { pageUrl: "https://example.test/", documentId: "doc" };
  await assert.rejects(exporter.exportArchive("s", { ...base, resources: [] }), { code: "RESOURCE_SELECTION_INVALID" });
  await assert.rejects(exporter.exportArchive("s", { ...base, resources: [{ resourceId: "r", url: "file:///secret", type: "Other", mimeType: "text/plain", content: "x" }] }), { code: "RESOURCE_URL_INVALID" });
  await assert.rejects(exporter.exportArchive("s", { ...base, resources: [{ resourceId: "r", url: "https://example.test/x", type: "Other", mimeType: "application/octet-stream", content: "not base64", base64Encoded: true }] }), { code: "RESOURCE_CONTENT_INVALID" });
  await assert.rejects(exporter.exportArchive("s", { ...base, resources: [{ resourceId: "r", url: "https://example.test/x", type: "Other", mimeType: "text/plain", content: "x".repeat(RESOURCE_EXPORT_LIMITS.maxResourceBytes + 1) }] }), { code: "RESOURCE_TOO_LARGE" });
});

test("resource exporter sanitizes C0 controls without invisible-character escapes", async (t) => {
  const source = await fs.readFile(new URL("../src/resource-export.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\\u00(?:00|1f)/i);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lingee-resource-export-filename-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const exporter = createResourceExporter({ rootDirectory: root, randomUUID: () => "sanitized" });
  const result = await exporter.exportArchive("session", {
    pageUrl: "https://example.test/page",
    documentId: "document",
    resources: [{ resourceId: "r", url: "https://example.test/file.txt", type: "Other", mimeType: "text/plain", suggestedFilename: `a${String.fromCharCode(0)}b${String.fromCharCode(31)}c.txt`, content: "safe", base64Encoded: false }]
  });
  const entries = readStoredZipEntries(await fs.readFile(result.path));
  assert.equal(entries.get("resources/a_b_c.txt").toString(), "safe");
});

function readStoredZipEntries(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString("utf8");
    entries.set(name, buffer.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}
