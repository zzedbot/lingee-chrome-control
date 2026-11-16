import crypto from "node:crypto";

export const ACTION_INTENT_TYPES = Object.freeze({
  upload: "sensitive-data-transfer",
  "message-send": "irreversible-write",
  delete: "irreversible-write",
  payment: "irreversible-write",
  "permission-change": "irreversible-write",
  login: "sensitive-data-transfer",
  "browser-permission": "reversible-write"
});

export const ACTION_INTENT_METHODS = Object.freeze([
  "browser.click", "browser.coordinateClick", "browser.press", "browser.fill", "browser.type",
  "browser.check", "browser.uncheck", "browser.setChecked", "browser.selectOption",
  "browser.setFileInput", "browser.setFileChooserFiles", "browser.handleDialog"
]);

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export function createActionIntentManager({ now = () => Date.now(), randomUUID = () => crypto.randomUUID(), ttlMs = DEFAULT_TTL_MS } = {}) {
  const intentsBySession = new Map();
  const approvalsBySession = new Map();

  function prepare(sessionId, input) {
    const session = requireSessionId(sessionId);
    const normalized = normalizeIntentInput(input);
    const scopeKey = scopeFor(normalized);
    const remembered = approvalsBySession.get(session)?.has(scopeKey) === true;
    const intent = {
      intentId: `intent-${randomUUID()}`,
      ...normalized,
      scopeKey,
      status: remembered ? "confirmed" : "pending-confirmation",
      confirmationRequired: !remembered,
      rememberedAuthorization: remembered,
      createdAt: new Date(now()).toISOString(),
      expiresAt: new Date(now() + ttlMs).toISOString()
    };
    const intents = intentsBySession.get(session) || new Map();
    intents.set(intent.intentId, intent);
    intentsBySession.set(session, intents);
    return publicIntent(intent);
  }

  function confirm(sessionId, { intentId, decision, rememberForSession = false } = {}) {
    const session = requireSessionId(sessionId);
    const intent = currentIntent(session, intentId);
    if (!['approve', 'reject'].includes(decision)) throw coded("INVALID_PARAMS", "decision must be approve or reject");
    if (intent.status !== "pending-confirmation") throw coded("ACTION_INTENT_STATE_INVALID", "The action intent is not awaiting confirmation", { intentId: intent.intentId, status: intent.status });
    intent.status = decision === "approve" ? "confirmed" : "rejected";
    intent.confirmationRequired = false;
    intent.confirmedAt = new Date(now()).toISOString();
    if (decision === "approve" && rememberForSession === true) {
      const approvals = approvalsBySession.get(session) || new Set();
      approvals.add(intent.scopeKey);
      approvalsBySession.set(session, approvals);
      intent.rememberedAuthorization = true;
    }
    return publicIntent(intent);
  }

  function consume(sessionId, intentId, tabId) {
    const session = requireSessionId(sessionId);
    const intent = currentIntent(session, intentId);
    if (tabId != null && intent.tabId !== tabId) throw coded("ACTION_INTENT_TAB_MISMATCH", "The action intent is bound to another tab", { intentId: intent.intentId, tabId });
    if (intent.status === "pending-confirmation") throw confirmationRequired(intent);
    if (intent.status === "rejected") throw coded("ACTION_CONFIRMATION_REJECTED", "The action intent was rejected", publicIntent(intent));
    if (intent.status !== "confirmed") throw coded("ACTION_INTENT_STATE_INVALID", "The action intent cannot be executed", { intentId: intent.intentId, status: intent.status });
    intent.status = "consumed";
    intent.executedAt = new Date(now()).toISOString();
    return { action: structuredClone(intent.action), intent: publicIntent(intent) };
  }

  function releaseSession(sessionId) {
    const session = requireSessionId(sessionId);
    const intentCount = intentsBySession.get(session)?.size || 0;
    const rememberedApprovalCount = approvalsBySession.get(session)?.size || 0;
    intentsBySession.delete(session);
    approvalsBySession.delete(session);
    return { intentCount, rememberedApprovalCount };
  }

  function currentIntent(session, intentId) {
    if (typeof intentId !== "string" || !intentId) throw coded("INVALID_PARAMS", "intentId is required");
    const intent = intentsBySession.get(session)?.get(intentId);
    if (!intent) throw coded("ACTION_INTENT_NOT_FOUND", "The action intent does not exist in this session", { intentId });
    if (Date.parse(intent.expiresAt) <= now() && !["consumed", "rejected"].includes(intent.status)) {
      intent.status = "expired";
      intent.confirmationRequired = false;
    }
    if (intent.status === "expired") throw coded("ACTION_INTENT_EXPIRED", "The action intent expired before execution", { intentId });
    return intent;
  }

  return { prepare, confirm, consume, releaseSession };
}

function normalizeIntentInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw coded("INVALID_PARAMS", "Action intent must be an object");
  if (!Object.hasOwn(ACTION_INTENT_TYPES, input.actionType)) throw coded("INVALID_PARAMS", "Unsupported actionType", { allowed: Object.keys(ACTION_INTENT_TYPES) });
  if (!Number.isInteger(input.tabId) || input.tabId < 0) throw coded("INVALID_PARAMS", "tabId must be a non-negative integer");
  const summary = boundedString(input.summary, "summary", 1, 500);
  const targetOrigin = normalizeOrigin(input.targetOrigin);
  const action = normalizeAction(input.action);
  const dataTypes = input.dataTypes == null ? [] : normalizeDataTypes(input.dataTypes);
  return { tabId: input.tabId, actionType: input.actionType, riskClass: ACTION_INTENT_TYPES[input.actionType], summary, targetOrigin, dataTypes, action };
}

function normalizeAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action) || !ACTION_INTENT_METHODS.includes(action.method)) {
    throw coded("INVALID_PARAMS", "action.method must be a supported high-level browser mutation", { allowed: ACTION_INTENT_METHODS });
  }
  if (action.params != null && (!action.params || typeof action.params !== "object" || Array.isArray(action.params))) throw coded("INVALID_PARAMS", "action.params must be an object");
  if (Object.hasOwn(action.params || {}, "tabId")) throw coded("INVALID_PARAMS", "action.params must not contain tabId; the intent-bound tab is used");
  return { method: action.method, params: structuredClone(action.params || {}) };
}

function normalizeDataTypes(values) {
  if (!Array.isArray(values) || values.length > 20 || values.some((value) => typeof value !== "string" || value.length < 1 || value.length > 100)) throw coded("INVALID_PARAMS", "dataTypes must contain at most 20 non-empty strings");
  return [...new Set(values)].sort();
}

function normalizeOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw coded("INVALID_PARAMS", "targetOrigin must be a valid URL origin"); }
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) throw coded("INVALID_PARAMS", "targetOrigin must be an exact HTTP(S) origin");
  return url.origin;
}

function scopeFor(intent) {
  return crypto.createHash("sha256").update(JSON.stringify({ actionType: intent.actionType, targetOrigin: intent.targetOrigin, summary: intent.summary, dataTypes: intent.dataTypes, action: intent.action })).digest("hex");
}

function publicIntent(intent) {
  return {
    intentId: intent.intentId,
    tabId: intent.tabId,
    actionType: intent.actionType,
    riskClass: intent.riskClass,
    summary: intent.summary,
    targetOrigin: intent.targetOrigin,
    dataTypes: intent.dataTypes,
    actionMethod: intent.action.method,
    status: intent.status,
    confirmationRequired: intent.confirmationRequired,
    rememberedAuthorization: intent.rememberedAuthorization === true,
    createdAt: intent.createdAt,
    expiresAt: intent.expiresAt,
    confirmedAt: intent.confirmedAt || null,
    executedAt: intent.executedAt || null
  };
}

function confirmationRequired(intent) {
  return coded("ACTION_CONFIRMATION_REQUIRED", "Explicit user confirmation is required before this action", publicIntent(intent));
}

function boundedString(value, field, minimum, maximum) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) throw coded("INVALID_PARAMS", `${field} must be ${minimum} to ${maximum} characters`);
  return value;
}

function requireSessionId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
  return id;
}

function coded(code, message, data) { return Object.assign(new Error(message), { code, data }); }
