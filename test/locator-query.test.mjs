import test from "node:test";
import assert from "node:assert/strict";
import { runLocatorQuery, validateLocatorQuery, validateLocatorQueryOptions } from "../extension/locator-query.js";

test("locator query validation requires an explicit supported selector", () => {
  assert.throws(() => validateLocatorQuery({}), (error) => error.code === "INVALID_LOCATOR");
  assert.throws(() => validateLocatorQuery({ css: ".item", future: true }), (error) => error.code === "INVALID_LOCATOR" && error.data.field === "future");
  assert.deepEqual(validateLocatorQuery({ role: "button", name: "Save", exact: true }), { role: "button", name: "Save", exact: true });
});

test("locator query options reject out-of-range limits before browser evaluation", () => {
  assert.throws(() => validateLocatorQueryOptions("allTextContents", { maxResults: 0 }), (error) => error.code === "INVALID_PARAMS" && error.data.field === "maxResults");
  assert.throws(() => validateLocatorQueryOptions("innerText", { maxChars: 500001 }), (error) => error.code === "INVALID_PARAMS" && error.data.field === "maxChars");
  assert.deepEqual(validateLocatorQueryOptions("allTextContents", { maxResults: 12 }), { maxResults: 12 });
});

test("collection locator queries include hidden matches and enforce result bounds", () => withDom(() => {
  const visible = element({ textContent: "Alpha", innerText: "Alpha" });
  const hidden = element({ textContent: "Beta", innerText: "Beta", hidden: true });
  document.set(".item", [visible, hidden]);

  assert.deepEqual(runLocatorQuery({ css: ".item" }, "count"), { ok: true, value: 2 });
  assert.deepEqual(runLocatorQuery({ css: ".item" }, "allTextContents", { maxResults: 2 }), { ok: true, value: ["Alpha", "Beta"] });
  assert.equal(runLocatorQuery({ css: ".item" }, "allTextContents", { maxResults: 1 }).error.code, "LOCATOR_RESULT_TOO_LARGE");
}));

test("strict locator queries return text and attributes without changing page state", () => withDom(() => {
  const target = element({ textContent: "Raw text", innerText: "Rendered text", attributes: { "data-kind": "primary" } });
  document.set('[data-testid="target"]', [target]);

  assert.deepEqual(runLocatorQuery({ testId: "target" }, "innerText"), { ok: true, value: "Rendered text" });
  assert.deepEqual(runLocatorQuery({ testId: "target" }, "textContent"), { ok: true, value: "Raw text" });
  assert.deepEqual(runLocatorQuery({ testId: "target" }, "getAttribute", { name: "data-kind" }), { ok: true, value: "primary" });
  assert.deepEqual(runLocatorQuery({ testId: "target" }, "getAttribute", { name: "missing" }), { ok: true, value: null });
}));

test("visibility and enabled queries return false for absent, hidden, and disabled controls", () => withDom(() => {
  const hidden = element({ hidden: true });
  const disabled = element({ disabled: true });
  const transparent = element({ style: { opacity: "0" } });
  document.set('[data-testid="hidden"]', [hidden]);
  document.set('[data-testid="disabled"]', [disabled]);
  document.set('[data-testid="transparent"]', [transparent]);
  document.set('[data-testid="missing"]', []);

  assert.deepEqual(runLocatorQuery({ testId: "hidden" }, "isVisible"), { ok: true, value: false });
  assert.deepEqual(runLocatorQuery({ testId: "disabled" }, "isEnabled"), { ok: true, value: false });
  assert.deepEqual(runLocatorQuery({ testId: "transparent" }, "isVisible"), { ok: true, value: true });
  assert.deepEqual(runLocatorQuery({ testId: "missing" }, "isVisible"), { ok: true, value: false });
}));

test("strict locator queries reject ambiguous matches and oversized text", () => withDom(() => {
  document.set(".duplicate", [element(), element()]);
  document.set(".large", [element({ textContent: "12345" })]);
  assert.equal(runLocatorQuery({ css: ".duplicate" }, "innerText").error.code, "LOCATOR_AMBIGUOUS");
  assert.equal(runLocatorQuery({ css: ".large" }, "textContent", { maxChars: 4 }).error.code, "LOCATOR_RESULT_TOO_LARGE");
}));

function withDom(callback) {
  const previousDocument = globalThis.document;
  const previousStyle = globalThis.getComputedStyle;
  const selectors = new Map();
  globalThis.document = {
    set(selector, values) { selectors.set(selector, values); },
    querySelectorAll(selector) {
      if (selector === "INVALID[") throw new Error("invalid selector");
      return selectors.get(selector) || [];
    },
    getElementById() { return null; }
  };
  globalThis.getComputedStyle = (value) => value.style;
  try { return callback(); }
  finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    if (previousStyle === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = previousStyle;
  }
}

function element({ textContent = "", innerText = textContent, hidden = false, disabled = false, attributes = {}, style = {} } = {}) {
  const values = new Map(Object.entries(attributes));
  return {
    tagName: "DIV", type: "", textContent, innerText, hidden, disabled, labels: [], value: "",
    style: { display: "block", visibility: "visible", opacity: "1", ...style },
    getAttribute(name) { return values.has(name) ? values.get(name) : null; },
    hasAttribute(name) { return values.has(name); },
    getBoundingClientRect() { return { width: 20, height: 10 }; },
    getClientRects() { return [{ width: 20, height: 10 }]; },
    closest() { return null; }
  };
}
