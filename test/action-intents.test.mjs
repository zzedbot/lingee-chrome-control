import test from "node:test";
import assert from "node:assert/strict";
import { createActionIntentManager } from "../src/action-intents.mjs";

const sessionId = "intent-session-a";
const stateDigest = "a".repeat(64);
const base = {
  tabId: 7,
  documentId: "document-a",
  stateDigest,
  actionType: "message-send",
  summary: "Send reviewed test message",
  targetOrigin: "https://example.test",
  dataTypes: ["text/plain"],
  action: { method: "browser.click", params: { locator: { testId: "send" } } }
};

test("action intents require confirmation and bind exact tab and action", () => {
  let clock = 1000;
  const manager = createActionIntentManager({ now: () => clock, randomUUID: () => "one" });
  const intent = manager.prepare(sessionId, base);
  assert.equal(intent.status, "pending-confirmation");
  assert.equal(intent.riskClass, "irreversible-write");
  assert.throws(() => manager.consume(sessionId, intent.intentId, 7, "document-a", stateDigest), { code: "ACTION_CONFIRMATION_REQUIRED" });
  assert.throws(() => manager.consume(sessionId, intent.intentId, 8, "document-a", stateDigest), { code: "ACTION_INTENT_TAB_MISMATCH" });
  assert.equal(manager.confirm(sessionId, { intentId: intent.intentId, decision: "approve" }).status, "confirmed");
  const consumed = manager.consume(sessionId, intent.intentId, 7, "document-a", stateDigest);
  assert.equal(consumed.action.method, "browser.click");
  assert.equal(consumed.intent.status, "consumed");
  assert.throws(() => manager.consume(sessionId, intent.intentId, 7, "document-a", stateDigest), { code: "ACTION_INTENT_STATE_INVALID" });
  clock += 1;
});

test("remembered approvals are session-scoped and exact-scope only", () => {
  let id = 0;
  const manager = createActionIntentManager({ randomUUID: () => String(++id) });
  const first = manager.prepare(sessionId, base);
  manager.confirm(sessionId, { intentId: first.intentId, decision: "approve", rememberForSession: true });
  const repeated = manager.prepare(sessionId, base);
  assert.equal(repeated.confirmationRequired, false);
  assert.equal(repeated.rememberedAuthorization, true);
  const changed = manager.prepare(sessionId, { ...base, summary: "Send a different message" });
  assert.equal(changed.confirmationRequired, true);
  const otherSession = manager.prepare("intent-session-b", base);
  assert.equal(otherSession.confirmationRequired, true);
  assert.deepEqual(manager.releaseSession(sessionId), { intentCount: 3, rememberedApprovalCount: 1 });
});

test("action intents reject unsafe shapes, rejection, and expiry", () => {
  let clock = 0;
  const manager = createActionIntentManager({ now: () => clock, randomUUID: () => "exp", ttlMs: 100 });
  assert.throws(() => manager.prepare(sessionId, { ...base, actionType: "unknown" }), { code: "INVALID_PARAMS" });
  assert.throws(() => manager.prepare(sessionId, { ...base, action: { method: "browser.cdp", params: {} } }), { code: "INVALID_PARAMS" });
  assert.throws(() => manager.prepare(sessionId, { ...base, action: { method: "browser.click", params: { tabId: 7 } } }), { code: "INVALID_PARAMS" });
  const rejected = manager.prepare(sessionId, base);
  manager.confirm(sessionId, { intentId: rejected.intentId, decision: "reject" });
  assert.throws(() => manager.consume(sessionId, rejected.intentId, 7, "document-a", stateDigest), { code: "ACTION_CONFIRMATION_REJECTED" });
  const expiring = manager.prepare("intent-session-c", base);
  clock = 101;
  assert.throws(() => manager.consume("intent-session-c", expiring.intentId, 7, "document-a", stateDigest), { code: "ACTION_INTENT_EXPIRED" });
});

test("action intents become stale after a controlled state change or document replacement", () => {
  let id = 0;
  const manager = createActionIntentManager({ randomUUID: () => `stale-${++id}` });
  const changed = manager.prepare(sessionId, base);
  manager.confirm(sessionId, { intentId: changed.intentId, decision: "approve" });
  assert.deepEqual(manager.invalidateTab(sessionId, 7, "browser.click"), { tabId: 7, invalidated: 1 });
  assert.throws(() => manager.consume(sessionId, changed.intentId, 7, "document-a", stateDigest), { code: "ACTION_INTENT_STALE" });

  const navigated = manager.prepare(sessionId, base);
  manager.confirm(sessionId, { intentId: navigated.intentId, decision: "approve" });
  assert.throws(() => manager.consume(sessionId, navigated.intentId, 7, "document-b", stateDigest), { code: "ACTION_INTENT_STALE" });

  const manuallyChanged = manager.prepare(sessionId, base);
  manager.confirm(sessionId, { intentId: manuallyChanged.intentId, decision: "approve" });
  assert.throws(() => manager.consume(sessionId, manuallyChanged.intentId, 7, "document-a", "b".repeat(64)), { code: "ACTION_INTENT_STALE" });
});

test("record lifecycle intents classify create/update as reversible and submit as irreversible", () => {
  let id = 0;
  const manager = createActionIntentManager({ randomUUID: () => `record-${++id}` });
  assert.equal(manager.prepare(sessionId, { ...base, actionType: "record-create" }).riskClass, "reversible-write");
  assert.equal(manager.prepare(sessionId, { ...base, actionType: "record-update" }).riskClass, "reversible-write");
  assert.equal(manager.prepare(sessionId, { ...base, actionType: "record-submit" }).riskClass, "irreversible-write");
});
