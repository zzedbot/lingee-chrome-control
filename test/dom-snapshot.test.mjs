import test from "node:test";
import assert from "node:assert/strict";
import { domSnapshotExpression } from "../extension/dom-snapshot.js";

test("DOM snapshot expression compiles after template interpolation", () => {
  const source = domSnapshotExpression({ maxNodes: 25, maxTextChars: 500, includeGenericClickable: true });
  assert.doesNotThrow(() => new Function(`return ${source};`));
  assert.match(source, /includeGenericClickable = true/);
  assert.match(source, /CSS\.escape/);
});

test("DOM snapshot expression clamps bounds and redacts password values by construction", () => {
  const source = domSnapshotExpression({ maxNodes: 99999, maxTextChars: 1, includeFormContext: false });
  assert.match(source, /maxNodes = 5000/);
  assert.match(source, /maxTextChars = 100/);
  assert.match(source, /type !== 'password'/);
  assert.match(source, /includeFormContext = false/);
});
