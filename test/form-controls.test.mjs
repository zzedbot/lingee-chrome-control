import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSelections } from "../extension/form-controls.js";

test("select option inputs normalize value, label, index, and arrays", () => {
  assert.deepEqual(normalizeSelections("alpha"), [{ value: "alpha" }]);
  assert.deepEqual(normalizeSelections([{ label: "Beta" }, { index: 2 }]), [{ label: "Beta" }, { index: 2 }]);
});

test("select option inputs fail closed on empty, unknown, and invalid fields", () => {
  assert.throws(() => normalizeSelections([]), { code: "INVALID_PARAMS" });
  assert.throws(() => normalizeSelections({ text: "Beta" }), { code: "INVALID_PARAMS" });
  assert.throws(() => normalizeSelections({ index: -1 }), { code: "INVALID_PARAMS" });
});
