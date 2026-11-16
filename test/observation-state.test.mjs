import test from "node:test";
import assert from "node:assert/strict";
import { createObservationState } from "../extension/observation-state.js";

const evidence = { documentId: "doc-a", viewportSignature: "viewport-a", visualHash: "hash-a", coordinateSafe: true };

test("screenshot observations bind document, viewport, visual evidence, expiry, and tab", () => {
  let clock = 1000;
  const state = createObservationState({ now: () => clock, createId: () => "one", ttlMs: 100 });
  const observation = state.record(7, evidence);
  assert.equal(observation.operationSequence, 0);
  assert.equal(state.validate(7, observation.observationId, evidence).observationId, observation.observationId);
  assert.throws(() => state.validate(8, observation.observationId, evidence), { code: "OBSERVATION_NOT_FOUND" });
  assert.throws(() => state.validate(7, observation.observationId, { ...evidence, documentId: "doc-b" }), { code: "OBSERVATION_DOCUMENT_CHANGED" });
  assert.throws(() => state.validate(7, observation.observationId, { ...evidence, viewportSignature: "viewport-b" }), { code: "OBSERVATION_VIEWPORT_CHANGED" });
  assert.throws(() => state.validate(7, observation.observationId, { ...evidence, visualHash: "hash-b" }), { code: "OBSERVATION_VISUAL_CHANGED" });
  clock = 1100;
  assert.throws(() => state.validate(7, observation.observationId, evidence), { code: "OBSERVATION_EXPIRED" });
});

test("new screenshots replace stale observations and operation sequence is monotonic", () => {
  let id = 0;
  const state = createObservationState({ createId: () => String(++id) });
  const first = state.record(3, evidence);
  assert.equal(state.nextSequence(3), 1);
  const second = state.record(3, { ...evidence, visualHash: "hash-b" });
  assert.equal(second.operationSequence, 1);
  assert.throws(() => state.validate(3, first.observationId, evidence), { code: "OBSERVATION_NOT_FOUND" });
  state.invalidate(3);
  assert.throws(() => state.validate(3, second.observationId, { ...evidence, visualHash: "hash-b" }), { code: "OBSERVATION_NOT_FOUND" });
  assert.equal(state.nextSequence(3), 2);
  state.clear(3);
  assert.equal(state.currentSequence(3), 0);
});

test("non-viewport screenshots cannot authorize coordinate input", () => {
  const state = createObservationState({ createId: () => "unsafe" });
  const observation = state.record(1, { ...evidence, coordinateSafe: false });
  assert.throws(() => state.validate(1, observation.observationId, evidence), { code: "OBSERVATION_NOT_COORDINATE_SAFE" });
  assert.throws(() => state.validate(1, "", evidence), { code: "OBSERVATION_REQUIRED" });
});
