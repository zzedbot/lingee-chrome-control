import test from "node:test";
import assert from "node:assert/strict";
import { resolveFrameElement, validateFramePath } from "../extension/frame-locator.js";

test("frame paths are bounded ordered locator arrays", () => {
  assert.deepEqual(validateFramePath([{ testId: "outer" }, { css: "iframe.inner" }]), [{ testId: "outer" }, { css: "iframe.inner" }]);
  assert.throws(() => validateFramePath({}), (error) => error.code === "INVALID_FRAME_PATH");
  assert.throws(() => validateFramePath(Array.from({ length: 9 }, () => ({ css: "iframe" }))), (error) => error.code === "INVALID_FRAME_PATH");
  assert.throws(() => validateFramePath([{}]), (error) => error.code === "INVALID_FRAME_PATH" && error.data.index === 0);
});

test("frame locator resolves one visible iframe and rejects missing or ambiguous matches", () => withDom(() => {
  const target = frame({ attributes: { "data-testid": "target", title: "Reports" } });
  document.set('[data-testid="target"]', [target]);
  document.set("iframe.many", [target, frame()]);
  document.set("iframe.none", []);
  assert.equal(resolveFrameElement({ testId: "target" }), target);
  assert.throws(() => resolveFrameElement({ css: "iframe.many" }), /FRAME_AMBIGUOUS/);
  assert.throws(() => resolveFrameElement({ css: "iframe.none" }), /FRAME_NOT_FOUND/);
}));

function withDom(callback) {
  const savedDocument = globalThis.document;
  const savedStyle = globalThis.getComputedStyle;
  const selectors = new Map();
  globalThis.document = {
    set(selector, values) { selectors.set(selector, values); },
    querySelectorAll(selector) { return selectors.get(selector) || []; }
  };
  globalThis.getComputedStyle = (element) => element.style;
  try { return callback(); }
  finally {
    if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
    if (savedStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = savedStyle;
  }
}

function frame({ tagName = "IFRAME", attributes = {}, style = {} } = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    tagName, labels: [], innerText: "", textContent: "",
    style: { display: "block", visibility: "visible", ...style },
    getAttribute(name) { return values.get(name) ?? null; },
    getBoundingClientRect() { return { width: 320, height: 180 }; }
  };
}
