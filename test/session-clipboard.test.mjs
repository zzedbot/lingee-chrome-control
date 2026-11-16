import test from "node:test";
import assert from "node:assert/strict";
import {
  createSessionClipboard,
  SESSION_CLIPBOARD_LIMITS,
  SESSION_CLIPBOARD_MIME_TYPES
} from "../src/session-clipboard.mjs";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");

test("session clipboard isolates sessions and returns typed entries", () => {
  let time = 1000;
  const clipboard = createSessionClipboard({ now: () => time });
  const written = clipboard.write("session-one", [
    { mimeType: "text/plain", data: "hello" },
    { mimeType: "text/markdown", encoding: "utf8", data: "**hello**" },
    { mimeType: "text/html", data: "<strong>hello</strong>" },
    { mimeType: "image/png", encoding: "base64", data: png }
  ]);
  assert.deepEqual(written.mimeTypes, SESSION_CLIPBOARD_MIME_TYPES);
  assert.equal(written.itemCount, 4);
  assert.equal(clipboard.read("session-two").itemCount, 0);
  assert.deepEqual(clipboard.read("session-one", ["text/plain"]).items, [
    { mimeType: "text/plain", encoding: "utf8", data: "hello", sizeBytes: 5 }
  ]);
  time += 1;
  assert.equal(clipboard.read("session-one").updatedAt, 1000);
});

test("session clipboard validates MIME, encoding, duplicate types, PNG and size", () => {
  const clipboard = createSessionClipboard();
  assert.throws(() => clipboard.write("session-one", [{ mimeType: "application/octet-stream", encoding: "base64", data: "AA==" }]), { code: "CLIPBOARD_MIME_NOT_ALLOWED" });
  assert.throws(() => clipboard.write("session-one", [{ mimeType: "text/plain", data: "a" }, { mimeType: "text/plain", data: "b" }]), { code: "CLIPBOARD_ITEM_INVALID" });
  assert.throws(() => clipboard.write("session-one", [{ mimeType: "image/png", encoding: "base64", data: Buffer.from("not png").toString("base64") }]), { code: "CLIPBOARD_BINARY_INVALID" });
  assert.throws(() => clipboard.write("session-one", [{ mimeType: "text/plain", data: "x".repeat(SESSION_CLIPBOARD_LIMITS.maxItemBytes + 1) }]), { code: "CLIPBOARD_TOO_LARGE" });
  assert.throws(() => clipboard.read("session-one", ["image/jpeg"]), { code: "CLIPBOARD_MIME_NOT_ALLOWED" });
});

test("session clipboard clear and release erase content", () => {
  const clipboard = createSessionClipboard();
  clipboard.write("session-one", [{ mimeType: "text/plain", data: "temporary" }]);
  assert.equal(clipboard.clear("session-one").cleared, true);
  assert.equal(clipboard.read("session-one").itemCount, 0);
  clipboard.write("session-one", [{ mimeType: "text/plain", data: "temporary" }]);
  assert.equal(clipboard.releaseSession("session-one").cleared, true);
  assert.equal(clipboard.read("session-one").itemCount, 0);
});
