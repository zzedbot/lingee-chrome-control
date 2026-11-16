export const SESSION_CLIPBOARD_MIME_TYPES = Object.freeze([
  "text/plain",
  "text/markdown",
  "text/html",
  "image/png"
]);

export const SESSION_CLIPBOARD_LIMITS = Object.freeze({
  maxItems: 4,
  maxItemBytes: 256 * 1024,
  maxTotalBytes: 256 * 1024
});

const allowedMimeTypes = new Set(SESSION_CLIPBOARD_MIME_TYPES);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function createSessionClipboard({ now = () => Date.now() } = {}) {
  const sessions = new Map();

  function write(sessionId, rawItems) {
    const id = requireSessionId(sessionId);
    const items = normalizeItems(rawItems);
    const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
    const updatedAt = now();
    sessions.set(id, { items, totalBytes, updatedAt });
    return metadata(items, totalBytes, updatedAt);
  }

  function read(sessionId, rawMimeTypes) {
    const id = requireSessionId(sessionId);
    const mimeTypes = normalizeMimeFilter(rawMimeTypes);
    const entry = sessions.get(id);
    if (!entry) return { items: [], itemCount: 0, totalBytes: 0, updatedAt: null };
    const items = entry.items
      .filter(({ mimeType }) => !mimeTypes || mimeTypes.has(mimeType))
      .map(({ sizeBytes, ...item }) => ({ ...item, sizeBytes }));
    return {
      items,
      itemCount: items.length,
      totalBytes: items.reduce((sum, item) => sum + item.sizeBytes, 0),
      updatedAt: entry.updatedAt
    };
  }

  function clear(sessionId) {
    const id = requireSessionId(sessionId);
    const entry = sessions.get(id);
    sessions.delete(id);
    return {
      cleared: entry != null,
      itemCount: entry?.items.length ?? 0,
      totalBytes: entry?.totalBytes ?? 0
    };
  }

  return { write, read, clear, releaseSession: clear };
}

function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > SESSION_CLIPBOARD_LIMITS.maxItems) {
    throw coded("CLIPBOARD_ITEMS_INVALID", `items must contain 1 to ${SESSION_CLIPBOARD_LIMITS.maxItems} entries`);
  }
  const seen = new Set();
  const items = rawItems.map((rawItem, index) => normalizeItem(rawItem, index, seen));
  const totalBytes = items.reduce((sum, item) => sum + item.sizeBytes, 0);
  if (totalBytes > SESSION_CLIPBOARD_LIMITS.maxTotalBytes) {
    throw coded("CLIPBOARD_TOO_LARGE", `Session clipboard exceeds ${SESSION_CLIPBOARD_LIMITS.maxTotalBytes} bytes`, { maxBytes: SESSION_CLIPBOARD_LIMITS.maxTotalBytes });
  }
  return items;
}

function normalizeItem(rawItem, index, seen) {
  if (!isPlainObject(rawItem)) throw coded("CLIPBOARD_ITEM_INVALID", `items[${index}] must be an object`);
  const unknown = Object.keys(rawItem).find((key) => !["mimeType", "data", "encoding"].includes(key));
  if (unknown) throw coded("CLIPBOARD_ITEM_INVALID", `Unknown clipboard item field: ${unknown}`, { field: unknown, index });
  const mimeType = String(rawItem.mimeType || "").trim().toLowerCase();
  if (!allowedMimeTypes.has(mimeType)) throw coded("CLIPBOARD_MIME_NOT_ALLOWED", `Clipboard MIME type is not allowed: ${mimeType || "(empty)"}`, { mimeType });
  if (seen.has(mimeType)) throw coded("CLIPBOARD_ITEM_INVALID", `Duplicate clipboard MIME type: ${mimeType}`, { mimeType });
  seen.add(mimeType);
  if (typeof rawItem.data !== "string") throw coded("CLIPBOARD_ITEM_INVALID", `Clipboard ${mimeType} data must be a string`, { mimeType });

  if (mimeType === "image/png") {
    if (rawItem.encoding !== "base64") throw coded("CLIPBOARD_ENCODING_INVALID", "image/png requires base64 encoding");
    const bytes = decodeCanonicalBase64(rawItem.data);
    if (bytes.length < pngSignature.length || !bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
      throw coded("CLIPBOARD_BINARY_INVALID", "image/png data does not have a PNG signature");
    }
    assertItemSize(bytes.length);
    return { mimeType, encoding: "base64", data: rawItem.data, sizeBytes: bytes.length };
  }

  if (rawItem.encoding !== undefined && rawItem.encoding !== "utf8") throw coded("CLIPBOARD_ENCODING_INVALID", `${mimeType} requires utf8 encoding`);
  const sizeBytes = Buffer.byteLength(rawItem.data, "utf8");
  assertItemSize(sizeBytes);
  return { mimeType, encoding: "utf8", data: rawItem.data, sizeBytes };
}

function normalizeMimeFilter(rawMimeTypes) {
  if (rawMimeTypes === undefined) return null;
  if (!Array.isArray(rawMimeTypes) || rawMimeTypes.length < 1 || rawMimeTypes.length > SESSION_CLIPBOARD_LIMITS.maxItems) {
    throw coded("CLIPBOARD_ITEMS_INVALID", `mimeTypes must contain 1 to ${SESSION_CLIPBOARD_LIMITS.maxItems} entries`);
  }
  const mimeTypes = new Set();
  for (const rawMimeType of rawMimeTypes) {
    const mimeType = String(rawMimeType || "").trim().toLowerCase();
    if (!allowedMimeTypes.has(mimeType)) throw coded("CLIPBOARD_MIME_NOT_ALLOWED", `Clipboard MIME type is not allowed: ${mimeType || "(empty)"}`, { mimeType });
    mimeTypes.add(mimeType);
  }
  return mimeTypes;
}

function decodeCanonicalBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw coded("CLIPBOARD_BINARY_INVALID", "Binary clipboard data must use canonical base64");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) throw coded("CLIPBOARD_BINARY_INVALID", "Binary clipboard data must use canonical base64");
  return bytes;
}

function assertItemSize(sizeBytes) {
  if (sizeBytes > SESSION_CLIPBOARD_LIMITS.maxItemBytes) {
    throw coded("CLIPBOARD_TOO_LARGE", `Clipboard item exceeds ${SESSION_CLIPBOARD_LIMITS.maxItemBytes} bytes`, { maxBytes: SESSION_CLIPBOARD_LIMITS.maxItemBytes });
  }
}

function metadata(items, totalBytes, updatedAt) {
  return { itemCount: items.length, totalBytes, mimeTypes: items.map(({ mimeType }) => mimeType), updatedAt };
}

function requireSessionId(value) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(id)) throw coded("SESSION_ID_REQUIRED", "A valid non-secret sessionId is required");
  return id;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function coded(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
