import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resourceExportDirectory } from "./runtime-paths.mjs";

export const RESOURCE_EXPORT_LIMITS = Object.freeze({
  maxResources: 20,
  maxResourceBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024
});

export function createResourceExporter({ rootDirectory = resourceExportDirectory(), now = () => Date.now(), randomUUID = () => crypto.randomUUID() } = {}) {
  const artifactsBySession = new Map();

  async function exportArchive(sessionId, payload) {
    const normalized = normalizePayload(payload);
    const sessionDirectory = path.join(rootDirectory, sessionKey(sessionId));
    await fs.mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    const fileName = `lingee-page-resources-${randomUUID()}.zip`;
    const artifactPath = path.join(sessionDirectory, fileName);
    const entries = [];
    const usedNames = new Set();
    let totalResourceBytes = 0;
    const manifestResources = [];

    for (const resource of normalized.resources) {
      const bytes = decodeResource(resource);
      if (bytes.length > RESOURCE_EXPORT_LIMITS.maxResourceBytes) throw coded("RESOURCE_TOO_LARGE", "One selected resource exceeds the per-resource export limit", { maxBytes: RESOURCE_EXPORT_LIMITS.maxResourceBytes, resourceId: resource.resourceId });
      totalResourceBytes += bytes.length;
      if (totalResourceBytes > RESOURCE_EXPORT_LIMITS.maxTotalBytes) throw coded("RESOURCE_EXPORT_TOO_LARGE", "Selected resources exceed the total export limit", { maxBytes: RESOURCE_EXPORT_LIMITS.maxTotalBytes });
      const entryName = uniqueEntryName(safeFileName(resource.suggestedFilename || fileNameFromUrl(resource.url, resource.mimeType)), usedNames);
      entries.push({ name: `resources/${entryName}`, data: bytes });
      manifestResources.push({
        resourceId: resource.resourceId,
        path: `resources/${entryName}`,
        url: resource.url,
        type: resource.type,
        mimeType: resource.mimeType,
        byteCount: bytes.length
      });
    }

    const manifest = {
      format: "lingee-observed-resources-v1",
      pageUrl: normalized.pageUrl,
      documentId: normalized.documentId,
      createdAt: new Date(now()).toISOString(),
      resourceCount: manifestResources.length,
      totalResourceBytes,
      resources: manifestResources
    };
    entries.unshift({ name: "manifest.json", data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8") });
    const archive = createZip(entries, new Date(now()));
    await fs.writeFile(artifactPath, archive, { mode: 0o600, flag: "wx" });
    const artifacts = artifactsBySession.get(sessionId) || new Set();
    artifacts.add(artifactPath);
    artifactsBySession.set(sessionId, artifacts);
    return {
      path: artifactPath,
      fileName,
      format: "zip",
      resourceCount: manifestResources.length,
      totalResourceBytes,
      archiveBytes: archive.length,
      lifecycle: "session-temporary"
    };
  }

  async function releaseSession(sessionId) {
    const artifacts = [...(artifactsBySession.get(sessionId) || [])];
    artifactsBySession.delete(sessionId);
    let removed = 0;
    for (const artifact of artifacts) {
      if (!isWithin(rootDirectory, artifact)) continue;
      try {
        await fs.unlink(artifact);
        removed += 1;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const sessionDirectory = path.join(rootDirectory, sessionKey(sessionId));
    if (isWithin(rootDirectory, sessionDirectory)) await fs.rmdir(sessionDirectory).catch((error) => { if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error; });
    return { removed };
  }

  async function releaseAll() {
    let removed = 0;
    for (const sessionId of [...artifactsBySession.keys()]) removed += (await releaseSession(sessionId)).removed;
    return { removed };
  }

  return { exportArchive, releaseSession, releaseAll };
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw coded("RESOURCE_EXPORT_INVALID", "Resource export payload must be an object");
  const pageUrl = requireHttpUrl(payload.pageUrl, "pageUrl");
  const documentId = requireString(payload.documentId, "documentId", 200);
  if (!Array.isArray(payload.resources) || payload.resources.length < 1 || payload.resources.length > RESOURCE_EXPORT_LIMITS.maxResources) {
    throw coded("RESOURCE_SELECTION_INVALID", `resources must contain 1 to ${RESOURCE_EXPORT_LIMITS.maxResources} items`);
  }
  const ids = new Set();
  const resources = payload.resources.map((resource) => {
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) throw coded("RESOURCE_EXPORT_INVALID", "Each resource must be an object");
    const resourceId = requireString(resource.resourceId, "resourceId", 200);
    if (ids.has(resourceId)) throw coded("RESOURCE_SELECTION_INVALID", "resourceIds must be unique");
    ids.add(resourceId);
    return {
      resourceId,
      url: requireHttpUrl(resource.url, "resource.url"),
      type: requireString(resource.type || "Other", "resource.type", 100),
      mimeType: requireString(resource.mimeType || "application/octet-stream", "resource.mimeType", 200),
      suggestedFilename: typeof resource.suggestedFilename === "string" ? resource.suggestedFilename : "",
      content: requireString(resource.content, "resource.content", 12 * 1024 * 1024),
      base64Encoded: resource.base64Encoded === true
    };
  });
  return { pageUrl, documentId, resources };
}

function decodeResource(resource) {
  if (!resource.base64Encoded) return Buffer.from(resource.content, "utf8");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(resource.content)) throw coded("RESOURCE_CONTENT_INVALID", "Resource content is not canonical Base64", { resourceId: resource.resourceId });
  const bytes = Buffer.from(resource.content, "base64");
  if (bytes.toString("base64") !== resource.content) throw coded("RESOURCE_CONTENT_INVALID", "Resource content is not canonical Base64", { resourceId: resource.resourceId });
  return bytes;
}

function createZip(entries, timestamp) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const { date, time } = dosTimestamp(timestamp);
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(value) {
  const date = value instanceof Date && !Number.isNaN(value.valueOf()) ? value : new Date();
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  };
}

function fileNameFromUrl(value, mimeType) {
  const url = new URL(value);
  const base = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "resource");
  if (path.extname(base)) return base;
  return `${base}${extensionForMime(mimeType)}`;
}

function extensionForMime(mimeType) {
  return ({ "text/css": ".css", "text/javascript": ".js", "application/javascript": ".js", "application/json": ".json", "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "text/plain": ".txt", "text/vtt": ".vtt" }[String(mimeType).toLowerCase()] || ".bin");
}

function safeFileName(value) {
  const cleaned = String(value || "resource").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").slice(0, 120);
  return cleaned && cleaned !== "." && cleaned !== ".." ? cleaned : "resource.bin";
}

function uniqueEntryName(value, used) {
  const extension = path.extname(value);
  const stem = value.slice(0, Math.max(0, value.length - extension.length));
  let candidate = value;
  for (let index = 2; used.has(candidate.toLowerCase()); index += 1) candidate = `${stem}-${index}${extension}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function sessionKey(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId)).digest("hex").slice(0, 24);
}

function requireString(value, field, maxLength) {
  if (typeof value !== "string" || !value || value.length > maxLength) throw coded("RESOURCE_EXPORT_INVALID", `${field} must be a non-empty string no longer than ${maxLength} characters`);
  return value;
}

function requireHttpUrl(value, field) {
  const raw = requireString(value, field, 4096);
  let url;
  try { url = new URL(raw); } catch { throw coded("RESOURCE_URL_INVALID", `${field} must be a valid URL`); }
  if (!["http:", "https:"].includes(url.protocol)) throw coded("RESOURCE_URL_INVALID", `${field} must use HTTP or HTTPS`);
  return url.href;
}

function isWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function coded(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
