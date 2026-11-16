export const OBSERVATION_TTL_MS = 30_000;

export function createObservationState({ now = () => Date.now(), createId = () => crypto.randomUUID(), ttlMs = OBSERVATION_TTL_MS } = {}) {
  const observationsByTab = new Map();
  const sequencesByTab = new Map();

  function record(tabId, evidence) {
    const observation = {
      observationId: `observation-${createId()}`,
      tabId,
      documentId: requiredString(evidence.documentId, "documentId"),
      viewportSignature: requiredString(evidence.viewportSignature, "viewportSignature"),
      visualHash: requiredString(evidence.visualHash, "visualHash"),
      coordinateSafe: evidence.coordinateSafe === true,
      operationSequence: currentSequence(tabId),
      createdAt: new Date(now()).toISOString(),
      expiresAt: new Date(now() + ttlMs).toISOString()
    };
    observationsByTab.set(tabId, new Map([[observation.observationId, observation]]));
    return publicObservation(observation);
  }

  function validate(tabId, observationId, current) {
    if (typeof observationId !== "string" || !observationId) throw coded("OBSERVATION_REQUIRED", "A fresh screenshot observationId is required for coordinate input");
    const observation = observationsByTab.get(tabId)?.get(observationId);
    if (!observation) throw coded("OBSERVATION_NOT_FOUND", "The screenshot observation is not available for this tab", { observationId });
    if (Date.parse(observation.expiresAt) <= now()) throw coded("OBSERVATION_EXPIRED", "The screenshot observation expired", { observationId, expiresAt: observation.expiresAt });
    if (!observation.coordinateSafe) throw coded("OBSERVATION_NOT_COORDINATE_SAFE", "The screenshot was not captured as a viewport PNG", { observationId });
    if (observation.documentId !== current.documentId) throw coded("OBSERVATION_DOCUMENT_CHANGED", "The page document changed after the screenshot", { observationId });
    if (observation.viewportSignature !== current.viewportSignature) throw coded("OBSERVATION_VIEWPORT_CHANGED", "The viewport or page geometry changed after the screenshot", { observationId });
    if (observation.visualHash !== current.visualHash) throw coded("OBSERVATION_VISUAL_CHANGED", "The visible page changed after the screenshot", { observationId });
    return publicObservation(observation);
  }

  function invalidate(tabId) { observationsByTab.delete(tabId); }
  function nextSequence(tabId) {
    const sequence = currentSequence(tabId) + 1;
    sequencesByTab.set(tabId, sequence);
    return sequence;
  }
  function currentSequence(tabId) { return sequencesByTab.get(tabId) || 0; }
  function clear(tabId) { observationsByTab.delete(tabId); sequencesByTab.delete(tabId); }

  return { record, validate, invalidate, nextSequence, currentSequence, clear };
}

function publicObservation(value) {
  return {
    observationId: value.observationId,
    coordinateSafe: value.coordinateSafe,
    operationSequence: value.operationSequence,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  };
}

function requiredString(value, field) {
  if (typeof value !== "string" || !value) throw coded("INVALID_PARAMS", `${field} is required`);
  return value;
}

function coded(code, message, data) { return Object.assign(new Error(message), { code, data }); }
