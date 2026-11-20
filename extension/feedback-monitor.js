export const FEEDBACK_MONITOR_KEY = "__lingeeBrowserFeedbackMonitorV1";

export function installFeedbackMonitor(key, options = {}) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const visible = (element) => {
    if (!element || element.nodeType !== 1 || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  };
  const elements = (root) => {
    if (!root) return [];
    const values = root.querySelectorAll ? [...root.querySelectorAll("*")] : [];
    if (root.nodeType === 1) values.unshift(root);
    return values.slice(0, 2000);
  };
  const describe = (element, state) => {
    if (!element || element.nodeType !== 1 || !visible(element)) return null;
    const text = normalize(element.innerText ?? element.textContent);
    const matched = state.exact ? text === state.expectedText : text.includes(state.expectedText);
    if (!text || !state.expectedText || !matched) return null;
    const role = normalize(element.getAttribute?.("role")).toLowerCase() || null;
    const ariaLive = normalize(element.getAttribute?.("aria-live")).toLowerCase() || null;
    const semantic = role === "alert" || role === "status" || (ariaLive && ariaLive !== "off");
    const boundedText = text.slice(0, state.maxTextChars);
    return {
      text: boundedText,
      role,
      ariaLive,
      tag: String(element.localName || element.tagName || "").toLowerCase(),
      semantic,
      signature: `${role || ""}::lingee::${ariaLive || ""}::lingee::${boundedText}`
    };
  };
  const capture = (roots, state) => {
    const candidates = [];
    for (const root of roots) {
      let current = root;
      for (let depth = 0; current && depth < 4; depth += 1, current = current.parentElement) candidates.push(current);
      candidates.push(...elements(root));
    }
    const matches = candidates
      .map((element) => ({ element, match: describe(element, state) }))
      .filter(({ match }) => match && !state.baseline.has(match.signature) && !state.seen.has(match.signature))
      .sort((left, right) => Number(right.match.semantic) - Number(left.match.semantic) || left.match.text.length - right.match.text.length);
    const selected = matches[0];
    if (!selected || state.events.length >= state.maxEvents) return;
    state.seen.add(selected.match.signature);
    state.events.push({ ...selected.match, node: selected.element, appearedAt: Date.now() });
  };
  const previous = globalThis[key];
  previous?.observer?.disconnect?.();

  const expectedText = normalize(options.text);
  const exact = options.exact === true;
  const maxTextChars = Math.max(1, Math.min(Number(options.maxTextChars) || 2000, 10000));
  const maxEvents = Math.max(1, Math.min(Number(options.maxEvents) || 20, 50));
  const baseline = new Set();
  const seen = new Set();
  const events = [];

  const state = { expectedText, exact, maxTextChars, maxEvents, baseline, seen, events, observer: null };
  globalThis[key] = state;

  for (const element of elements(document.documentElement)) {
    const match = describe(element, state);
    if (match) baseline.add(match.signature);
  }

  const observer = new MutationObserver((records) => {
    for (const record of records || []) {
      const roots = [];
      if (record?.target) roots.push(record.target.nodeType === 1 ? record.target : record.target.parentElement);
      for (const node of record?.addedNodes || []) roots.push(node.nodeType === 1 ? node : node.parentElement);
      capture(roots, state);
      if (events.length >= maxEvents) break;
    }
  });
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["role", "aria-live", "aria-hidden", "class", "style"] });
  state.observer = observer;
  return { installed: true, expectedText, exact, maxTextChars, maxEvents };
}

export function readFeedbackMonitor(key) {
  const visible = (element) => {
    if (!element || element.nodeType !== 1 || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = element.getBoundingClientRect?.();
    return !rect || (rect.width > 0 && rect.height > 0);
  };
  const state = globalThis[key];
  if (!state) return { installed: false, events: [] };
  return {
    installed: true,
    events: state.events.map(({ node, ...event }) => ({
      ...event,
      visible: visible(node),
      disappeared: !node?.isConnected || !visible(node)
    }))
  };
}

export function removeFeedbackMonitor(key) {
  const state = globalThis[key];
  state?.observer?.disconnect?.();
  if (state) delete globalThis[key];
  return { removed: Boolean(state), captured: state?.events?.length || 0 };
}
