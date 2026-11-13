import test from "node:test";
import assert from "node:assert/strict";
import { createSessionManager } from "../src/session-manager.mjs";

test("tab leases isolate sessions while allowing independent tabs", () => {
  let time = 1000;
  const manager = createSessionManager({ leaseMs: 500, now: () => time });
  manager.acquire(1, "session-a", { temporary: false });
  manager.acquire(2, "session-b", { temporary: true });
  assert.equal(manager.assertOwner(1, "session-a").temporary, false);
  assert.throws(() => manager.assertOwner(1, "session-b"), { code: "TAB_OWNED_BY_ANOTHER_SESSION" });
  time += 501;
  assert.throws(() => manager.assertOwner(1, "session-b"), { code: "TAB_NOT_CLAIMED" });
});

test("handoff, deliverable, transfer, and session release retain lifecycle state", () => {
  const manager = createSessionManager();
  manager.acquire(3, "session-owner", { temporary: true });
  manager.mark(3, "session-owner", "handoff");
  manager.transfer(3, "session-owner", "session-target");
  assert.equal(manager.get(3).sessionId, "session-target");
  manager.mark(3, "session-target", "deliverable");
  const released = manager.releaseSession("session-target");
  assert.equal(released[0].marker, "deliverable");
  assert.equal(manager.get(3), null);
});
