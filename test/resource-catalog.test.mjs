import test from "node:test";
import assert from "node:assert/strict";
import { createObservedResourceCatalog, OBSERVED_RESOURCE_LIMITS, resourceContentByteSize } from "../extension/resource-catalog.js";
import { readFile } from "node:fs/promises";

test("observed resource catalog binds opaque IDs to one current HTTP document", () => {
  let nextId = 0;
  const catalog = createObservedResourceCatalog(() => String(++nextId));
  const tree = resourceTree("loader-a", [
    { url: "https://example.test/app.css", type: "Stylesheet", mimeType: "text/css", contentSize: 12 },
    { url: "https://cdn.test/app.js", type: "Script", mimeType: "application/javascript", contentSize: 24 },
    { url: "data:text/plain,ignored", type: "Other", mimeType: "text/plain" },
    { url: "https://example.test/broken.png", type: "Image", mimeType: "image/png", failed: true }
  ]);
  const listed = catalog.list(tree);
  assert.equal(listed.resourceCount, 2);
  assert.match(listed.documentId, /^document-/);
  assert.ok(listed.resources.every(({ resourceId }) => /^resource-/.test(resourceId)));
  const selected = catalog.select(tree, [listed.resources[0].resourceId]);
  assert.equal(selected.resources[0].url, "https://example.test/app.css");
  assert.equal(selected.frameId, "frame-a");
  assert.throws(() => catalog.select(resourceTree("loader-b", []), [listed.resources[0].resourceId]), { code: "RESOURCE_DOCUMENT_CHANGED" });
});

test("observed resource catalog filters and bounds explicit selections", () => {
  let nextId = 0;
  const catalog = createObservedResourceCatalog(() => String(++nextId));
  const resources = Array.from({ length: 30 }, (_, index) => ({ url: `https://example.test/${index}.png`, type: "Image", mimeType: "image/png", contentSize: index }));
  const tree = resourceTree("loader-a", resources);
  const listed = catalog.list(tree, { types: ["Image"], mimeTypes: ["image/png"], maxResults: 5 });
  assert.equal(listed.resources.length, 5);
  assert.equal(listed.truncated, true);
  assert.throws(() => catalog.select(tree, []), { code: "RESOURCE_SELECTION_INVALID" });
  assert.throws(() => catalog.select(tree, Array(OBSERVED_RESOURCE_LIMITS.maxSelection + 1).fill("x")), { code: "RESOURCE_SELECTION_INVALID" });
  assert.throws(() => catalog.select(tree, ["missing"]), { code: "RESOURCE_NOT_FOUND" });
});

test("resource content byte sizing handles UTF-8 and canonical Base64", () => {
  assert.equal(resourceContentByteSize("灵基", false), 6);
  assert.equal(resourceContentByteSize("AQID", true), 3);
  assert.throws(() => resourceContentByteSize("not base64", true), { code: "RESOURCE_CONTENT_INVALID" });
});

test("resource catalog avoids invisible-character escapes while preserving filename sanitization", async () => {
  const source = await readFile(new URL("../extension/resource-catalog.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\\u00(?:00|1f)/i);
  const catalog = createObservedResourceCatalog(() => "stable");
  const listed = catalog.list(resourceTree("loader-a", [{ url: "https://example.test/a%00b%1Fc.txt", type: "Other", mimeType: "text/plain" }]));
  assert.equal(listed.resources[0].suggestedFilename, "a_b_c.txt");
});

function resourceTree(loaderId, resources) {
  return { frameTree: { frame: { id: "frame-a", loaderId, url: "https://example.test/page" }, resources } };
}
