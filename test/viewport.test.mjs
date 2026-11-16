import test from "node:test";
import assert from "node:assert/strict";
import { normalizeViewportOptions, viewportResult } from "../extension/viewport.js";

test("viewport options accept bounded desktop and mobile profiles", () => {
  assert.deepEqual(normalizeViewportOptions({ width: 1280, height: 720 }), { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  assert.deepEqual(normalizeViewportOptions({ width: 390, height: 844, deviceScaleFactor: 3, mobile: true }), { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
});

test("viewport options reject unsafe dimensions, scale, and mobile values", () => {
  for (const value of [
    { width: 319, height: 720 }, { width: 1280, height: 2170 },
    { width: 390, height: 844, deviceScaleFactor: 0 },
    { width: 390, height: 844, deviceScaleFactor: 5 },
    { width: 390, height: 844, mobile: "yes" }
  ]) assert.throws(() => normalizeViewportOptions(value), (error) => /^VIEWPORT_/.test(error.code));
});

test("viewport result distinguishes native and emulated metrics", () => {
  const metrics = { cssVisualViewport: { clientWidth: 390, clientHeight: 844, pageX: 12, pageY: 24, scale: 1 } };
  assert.deepEqual(viewportResult(metrics, { width: 390, height: 844, deviceScaleFactor: 3, mobile: true }), {
    width: 390, height: 844, pageX: 12, pageY: 24, scale: 1, deviceScaleFactor: 3, mobile: true, emulated: true
  });
  assert.equal(viewportResult(metrics).emulated, false);
  assert.equal(viewportResult(metrics).deviceScaleFactor, null);
});
