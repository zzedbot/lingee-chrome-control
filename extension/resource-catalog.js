export const OBSERVED_RESOURCE_LIMITS = Object.freeze({
  maxListResults: 500,
  maxSelection: 20,
  maxResourceBytes: 4 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024
});

export function createObservedResourceCatalog(createId = () => crypto.randomUUID()) {
  let state = null;

  function list(frameTree, options = {}) {
    const root = normalizeRoot(frameTree);
    if (!state || state.loaderId !== root.loaderId) state = { loaderId: root.loaderId, documentId: `document-${createId()}`, frameId: root.frameId, pageUrl: root.pageUrl, byId: new Map(), idByKey: new Map() };
    state.frameId = root.frameId;
    state.pageUrl = root.pageUrl;
    const typeFilter = normalizeFilter(options.types, "types");
    const mimeFilter = normalizeFilter(options.mimeTypes, "mimeTypes");
    const maxResults = boundedInteger(options.maxResults, 1, OBSERVED_RESOURCE_LIMITS.maxListResults, 200, "maxResults");
    const currentIds = new Set();
    const resources = [];
    for (const raw of root.resources) {
      const resource = normalizeResource(raw);
      if (!resource) continue;
      const key = JSON.stringify([resource.url, resource.type]);
      let resourceId = state.idByKey.get(key);
      if (!resourceId) {
        resourceId = `resource-${createId()}`;
        state.idByKey.set(key, resourceId);
      }
      const stored = { ...resource, resourceId };
      state.byId.set(resourceId, stored);
      currentIds.add(resourceId);
      if (typeFilter && !typeFilter.has(resource.type.toLowerCase())) continue;
      if (mimeFilter && !mimeFilter.has(resource.mimeType.toLowerCase())) continue;
      if (resources.length < maxResults) resources.push(publicResource(stored));
    }
    for (const resourceId of state.byId.keys()) if (!currentIds.has(resourceId)) state.byId.delete(resourceId);
    return { documentId: state.documentId, pageUrl: state.pageUrl, resourceCount: resources.length, truncated: currentIds.size > resources.length, resources };
  }

  function select(frameTree, resourceIds) {
    const root = normalizeRoot(frameTree);
    if (!state) throw coded("RESOURCE_CATALOG_REQUIRED", "List observed resources before exporting them");
    if (state.loaderId !== root.loaderId) throw coded("RESOURCE_DOCUMENT_CHANGED", "The page document changed after the resource list was observed");
    if (!Array.isArray(resourceIds) || resourceIds.length < 1 || resourceIds.length > OBSERVED_RESOURCE_LIMITS.maxSelection) throw coded("RESOURCE_SELECTION_INVALID", `resourceIds must contain 1 to ${OBSERVED_RESOURCE_LIMITS.maxSelection} items`);
    if (new Set(resourceIds).size !== resourceIds.length || resourceIds.some((value) => typeof value !== "string" || !value)) throw coded("RESOURCE_SELECTION_INVALID", "resourceIds must contain unique non-empty strings");
    const resources = resourceIds.map((resourceId) => {
      const resource = state.byId.get(resourceId);
      if (!resource) throw coded("RESOURCE_NOT_FOUND", "A selected resource is not part of the current observed document", { resourceId });
      return resource;
    });
    return { documentId: state.documentId, pageUrl: state.pageUrl, frameId: state.frameId, resources };
  }

  function clear() { state = null; }

  return { clear, list, select };
}

export function resourceContentByteSize(content, base64Encoded) {
  if (typeof content !== "string") throw coded("RESOURCE_CONTENT_INVALID", "Resource content must be a string");
  if (!base64Encoded) return new TextEncoder().encode(content).length;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) throw coded("RESOURCE_CONTENT_INVALID", "Resource content is not canonical Base64");
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return (content.length / 4) * 3 - padding;
}

function normalizeRoot(frameTree) {
  const root = frameTree?.frameTree || frameTree;
  const frame = root?.frame;
  if (!frame?.id || !frame?.loaderId || !isHttpUrl(frame.url)) throw coded("RESOURCE_TREE_UNAVAILABLE", "The current HTTP(S) document resource tree is unavailable");
  return { frameId: frame.id, loaderId: frame.loaderId, pageUrl: new URL(frame.url).href, resources: Array.isArray(root.resources) ? root.resources : [] };
}

function normalizeResource(resource) {
  if (!resource || resource.failed === true || resource.canceled === true || !isHttpUrl(resource.url)) return null;
  const url = new URL(resource.url).href;
  const type = String(resource.type || "Other").slice(0, 100);
  const mimeType = String(resource.mimeType || "application/octet-stream").slice(0, 200).toLowerCase();
  const contentSize = Number.isFinite(Number(resource.contentSize)) && Number(resource.contentSize) >= 0 ? Number(resource.contentSize) : null;
  return { url, type, mimeType, contentSize, suggestedFilename: suggestedFilename(url, mimeType) };
}

function publicResource(resource) {
  return { resourceId: resource.resourceId, url: resource.url, type: resource.type, mimeType: resource.mimeType, contentSize: resource.contentSize, suggestedFilename: resource.suggestedFilename };
}

function suggestedFilename(value, mimeType) {
  const url = new URL(value);
  let base = "resource";
  try { base = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "resource"); } catch {}
  base = Array.from(base, (character) => character.codePointAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? "_" : character).join("");
  base = base.replace(/[. ]+$/g, "").slice(0, 120) || "resource";
  if (/\.[A-Za-z0-9]{1,10}$/.test(base)) return base;
  const extension = ({ "text/css": ".css", "text/javascript": ".js", "application/javascript": ".js", "application/json": ".json", "image/png": ".png", "image/jpeg": ".jpg", "image/svg+xml": ".svg", "text/plain": ".txt", "text/vtt": ".vtt" }[mimeType] || ".bin");
  return `${base}${extension}`;
}

function normalizeFilter(values, field) {
  if (values == null) return null;
  if (!Array.isArray(values) || values.length < 1 || values.length > 50 || values.some((value) => typeof value !== "string" || !value || value.length > 200)) throw coded("INVALID_PARAMS", `${field} must contain 1 to 50 non-empty strings`);
  return new Set(values.map((value) => value.toLowerCase()));
}

function boundedInteger(value, minimum, maximum, fallback, field) {
  if (value == null) return fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw coded("INVALID_PARAMS", `${field} must be an integer from ${minimum} to ${maximum}`);
  return value;
}

function isHttpUrl(value) {
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function coded(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
