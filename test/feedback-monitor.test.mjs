import test from "node:test";
import assert from "node:assert/strict";
import { FEEDBACK_MONITOR_KEY, installFeedbackMonitor, readFeedbackMonitor, removeFeedbackMonitor } from "../extension/feedback-monitor.js";

function element(text, attributes = {}) {
  const children = [];
  const node = {
    nodeType: 1,
    localName: "div",
    innerText: text,
    textContent: text,
    hidden: false,
    isConnected: true,
    parentElement: null,
    children,
    getAttribute: (name) => attributes[name] ?? null,
    getBoundingClientRect: () => ({ width: 100, height: 20 }),
    querySelectorAll: () => children.flatMap((child) => [child, ...child.querySelectorAll("*")])
  };
  node.append = (child) => { child.parentElement = node; children.push(child); };
  return node;
}

test("feedback monitor captures a transient matching status added after installation", () => {
  const root = element("");
  let callback;
  const saved = { document: globalThis.document, MutationObserver: globalThis.MutationObserver, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  globalThis.MutationObserver = class {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() {}
  };
  try {
    installFeedbackMonitor(FEEDBACK_MONITOR_KEY, { text: "保存成功", exact: true });
    const toast = element("保存成功", { role: "status", "aria-live": "polite" });
    root.append(toast);
    callback([{ target: root, addedNodes: [toast] }]);
    toast.isConnected = false;
    const result = readFeedbackMonitor(FEEDBACK_MONITOR_KEY);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].text, "保存成功");
    assert.equal(result.events[0].role, "status");
    assert.equal(result.events[0].disappeared, true);
    assert.deepEqual(removeFeedbackMonitor(FEEDBACK_MONITOR_KEY), { removed: true, captured: 1 });
  } finally {
    delete globalThis[FEEDBACK_MONITOR_KEY];
    globalThis.document = saved.document;
    globalThis.MutationObserver = saved.MutationObserver;
    globalThis.getComputedStyle = saved.getComputedStyle;
  }
});

test("feedback monitor ignores matching text that existed before registration", () => {
  const existing = element("保存成功", { role: "status" });
  const root = element("");
  root.append(existing);
  let callback;
  const saved = { document: globalThis.document, MutationObserver: globalThis.MutationObserver, getComputedStyle: globalThis.getComputedStyle };
  globalThis.document = { documentElement: root };
  globalThis.getComputedStyle = () => ({ display: "block", visibility: "visible" });
  globalThis.MutationObserver = class {
    constructor(fn) { callback = fn; }
    observe() {}
    disconnect() {}
  };
  try {
    installFeedbackMonitor(FEEDBACK_MONITOR_KEY, { text: "保存成功" });
    callback([{ target: existing, addedNodes: [] }]);
    assert.equal(readFeedbackMonitor(FEEDBACK_MONITOR_KEY).events.length, 0);
  } finally {
    removeFeedbackMonitor(FEEDBACK_MONITOR_KEY);
    globalThis.document = saved.document;
    globalThis.MutationObserver = saved.MutationObserver;
    globalThis.getComputedStyle = saved.getComputedStyle;
  }
});
