const DEFAULT_LEASE_MS = 30 * 60 * 1000;

export function createSessionManager({ leaseMs = DEFAULT_LEASE_MS, now = () => Date.now() } = {}) {
  const tabs = new Map();
  const sessions = new Map();

  function requireSessionId(value) {
    const id = String(value || "").trim();
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
    return id;
  }

  function touch(sessionId) {
    const id = requireSessionId(sessionId);
    sessions.set(id, { lastSeenAt: now() });
    for (const lease of tabs.values()) if (lease.sessionId === id) lease.expiresAt = now() + leaseMs;
    return id;
  }

  function acquire(tabId, sessionId, { temporary = false } = {}) {
    const id = touch(sessionId);
    const current = activeLease(tabId);
    if (current && current.sessionId !== id) throw coded("TAB_OWNED_BY_ANOTHER_SESSION", `Tab ${tabId} is owned by another session`, { tabId, expiresAt: current.expiresAt });
    const lease = current || { tabId, sessionId: id, temporary, marker: null, createdAt: now() };
    lease.sessionId = id;
    lease.temporary ||= temporary;
    lease.expiresAt = now() + leaseMs;
    tabs.set(tabId, lease);
    return publicLease(lease);
  }

  function assertOwner(tabId, sessionId) {
    const id = touch(sessionId);
    const lease = activeLease(tabId);
    if (!lease) throw coded("TAB_NOT_CLAIMED", `Tab ${tabId} must be claimed before mutation`, { tabId });
    if (lease.sessionId !== id) throw coded("TAB_OWNED_BY_ANOTHER_SESSION", `Tab ${tabId} is owned by another session`, { tabId, expiresAt: lease.expiresAt });
    lease.expiresAt = now() + leaseMs;
    return publicLease(lease);
  }

  function mark(tabId, sessionId, marker) {
    if (!['handoff', 'deliverable'].includes(marker)) throw coded("INVALID_PARAMS", "marker must be handoff or deliverable");
    assertOwner(tabId, sessionId);
    const lease = tabs.get(tabId);
    lease.marker = marker;
    return publicLease(lease);
  }

  function transfer(tabId, sessionId, targetSessionId) {
    assertOwner(tabId, sessionId);
    const target = requireSessionId(targetSessionId);
    const lease = tabs.get(tabId);
    lease.sessionId = target;
    lease.expiresAt = now() + leaseMs;
    sessions.set(target, { lastSeenAt: now() });
    return publicLease(lease);
  }

  function forgetTab(tabId) { tabs.delete(tabId); }

  function releaseSession(sessionId) {
    const id = requireSessionId(sessionId);
    const leases = [...tabs.values()].filter((lease) => lease.sessionId === id).map(publicLease);
    for (const lease of leases) tabs.delete(lease.tabId);
    sessions.delete(id);
    return leases;
  }

  function expiredSessions() {
    const threshold = now() - leaseMs;
    return [...sessions.entries()].filter(([, value]) => value.lastSeenAt <= threshold).map(([id]) => id);
  }

  function activeLease(tabId) {
    const lease = tabs.get(tabId);
    if (lease && lease.expiresAt <= now()) { tabs.delete(tabId); return null; }
    return lease || null;
  }

  return { acquire, assertOwner, mark, transfer, forgetTab, releaseSession, expiredSessions, touch, get: (tabId) => activeLease(tabId) ? publicLease(activeLease(tabId)) : null };
}

function publicLease(lease) {
  return { tabId: lease.tabId, sessionId: lease.sessionId, temporary: lease.temporary, marker: lease.marker, createdAt: lease.createdAt, expiresAt: lease.expiresAt };
}

function coded(code, message, data) { return Object.assign(new Error(message), { code, data }); }
