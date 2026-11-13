import { validateLocatorQuery } from "./locator-query.js";

export const FRAME_WORLD_NAME = "lingee-frame-locator-v1";

export function validateFramePath(framePath) {
  if (framePath == null) return [];
  if (!Array.isArray(framePath)) throw frameError("INVALID_FRAME_PATH", "framePath must be an array");
  if (framePath.length > 8) throw frameError("INVALID_FRAME_PATH", "framePath cannot contain more than 8 frames");
  return framePath.map((locator, index) => {
    try { return validateLocatorQuery(locator); }
    catch (error) { throw frameError("INVALID_FRAME_PATH", `Invalid frame locator at index ${index}: ${error.message}`, { index, cause: error.code }); }
  });
}

export function resolveFrameElement(locator) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const escapeAttribute = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const accessibleName = (el) => normalize(
    el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("name") ||
    (el.labels ? [...el.labels].map((label) => label.innerText || label.textContent || "").join(" ") : "") ||
    el.innerText || el.getAttribute("src")
  );
  const matches = (actual, expected) => locator.exact ? actual === expected : actual.includes(expected);
  let candidates;
  try {
    if (locator.css) candidates = [...document.querySelectorAll(locator.css)];
    else if (locator.testId) candidates = [...document.querySelectorAll(`[data-testid="${escapeAttribute(locator.testId)}"]`)];
    else candidates = [...document.querySelectorAll("iframe,frame")];
  } catch (cause) {
    throw new Error(`LINGEE_FRAME:${JSON.stringify({ code: "INVALID_FRAME_PATH", message: "The frame locator contains invalid CSS" })}`);
  }
  candidates = candidates.filter((el) => ["IFRAME", "FRAME"].includes(el.tagName));
  if (locator.role) candidates = candidates.filter((el) => (el.getAttribute("role") || "document") === locator.role);
  if (locator.label || locator.name) {
    const expected = normalize(locator.label || locator.name);
    candidates = candidates.filter((el) => matches(accessibleName(el), expected));
  }
  if (locator.text) {
    const expected = normalize(locator.text);
    candidates = candidates.filter((el) => matches(normalize(el.innerText || el.textContent), expected));
  }
  candidates = candidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });
  if (candidates.length === 0) throw new Error(`LINGEE_FRAME:${JSON.stringify({ code: "FRAME_NOT_FOUND", message: "No frame matched the frame locator" })}`);
  if (candidates.length !== 1) throw new Error(`LINGEE_FRAME:${JSON.stringify({ code: "FRAME_AMBIGUOUS", message: `Frame locator matched ${candidates.length} frames`, data: { count: candidates.length } })}`);
  return candidates[0];
}

function frameError(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
