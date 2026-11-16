import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomSnapshot } from "../extension/observation-evidence.js";

test("observation evidence excludes the Lingee overlay and retains page text and layout", () => {
  const strings = ["https://example.test/", "HTML", "BODY", "#text", "ready", "LINGEE-AGENT-CURSOR", "data-lingee-agent-cursor", "overlay-v13", "DIV", "cursor-child", "block"];
  const snapshot = { strings, documents: [{ documentURL: 0, baseURL: 0, nodes: {
    parentIndex: [-1, 0, 1, 1, 3, 1], nodeType: [1, 1, 3, 1, 1, 1], nodeName: [1, 2, 3, 5, 8, 8], nodeValue: [-1, -1, 4, -1, 9, -1], attributes: [[], [], [], [6, 7], [], []]
  }, layout: { nodeIndex: [1, 2, 3, 4, 5], bounds: [[0, 0, 100, 100], [1, 2, 30, 10], [0, 0, 100, 100], [5, 5, 10, 10], [2, 20, 30, 10]], styles: [[10], [10], [10], [10], [10]] } }] };
  const normalized = normalizeDomSnapshot(snapshot);
  assert.equal(normalized[0].nodes.some(({ name }) => name === "LINGEE-AGENT-CURSOR"), false);
  assert.equal(normalized[0].nodes.some(({ value }) => value === "cursor-child"), false);
  assert.equal(normalized[0].nodes.some(({ value }) => value === "ready"), true);
  assert.deepEqual(normalized[0].nodes.at(-1).layout.bounds, [2, 20, 30, 10]);
});
