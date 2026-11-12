const LOCATOR_KEYS = new Set(["css", "role", "name", "label", "text", "testId", "exact"]);
const LOCATOR_SELECTORS = ["css", "role", "name", "label", "text", "testId"];

export function validateLocatorQuery(locator) {
  if (!locator || typeof locator !== "object" || Array.isArray(locator)) {
    throw locatorError("INVALID_LOCATOR", "locator must be an object");
  }
  const unknown = Object.keys(locator).filter((key) => !LOCATOR_KEYS.has(key));
  if (unknown.length) {
    throw locatorError("INVALID_LOCATOR", `Unknown locator field: ${unknown[0]}`, { field: unknown[0] });
  }
  if (!LOCATOR_SELECTORS.some((key) => typeof locator[key] === "string" && locator[key].length > 0)) {
    throw locatorError("INVALID_LOCATOR", "locator must include css, role, name, label, text, or testId");
  }
  for (const key of LOCATOR_SELECTORS) {
    if (locator[key] != null && typeof locator[key] !== "string") {
      throw locatorError("INVALID_LOCATOR", `${key} must be a string`, { field: key });
    }
  }
  if (locator.exact != null && typeof locator.exact !== "boolean") {
    throw locatorError("INVALID_LOCATOR", "exact must be a boolean", { field: "exact" });
  }
  return locator;
}

export function validateLocatorQueryOptions(operation, options = {}) {
  const limits = operation === "allTextContents"
    ? { maxResults: 500, maxCharsPerItem: 100000, maxTotalChars: 500000 }
    : ["innerText", "textContent", "getAttribute"].includes(operation) ? { maxChars: 500000 } : {};
  for (const [name, maximum] of Object.entries(limits)) {
    if (options[name] == null) continue;
    if (!Number.isInteger(options[name]) || options[name] < 1 || options[name] > maximum) {
      throw locatorError("INVALID_PARAMS", `${name} must be an integer between 1 and ${maximum}`, { field: name });
    }
  }
  return options;
}

export function runLocatorQuery(locator, operation, options = {}) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const escapeAttribute = (value) => String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const implicitRole = (el) => el.getAttribute("role") || ({
    A: el.hasAttribute?.("href") ? "link" : null,
    BUTTON: "button",
    SELECT: el.multiple ? "listbox" : "combobox",
    TEXTAREA: "textbox",
    INPUT: el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : ["button", "submit", "reset"].includes(el.type) ? "button" : "textbox"
  }[el.tagName] || null);
  const labelledByText = (el) => normalize((el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => document.getElementById(id)?.textContent || "").join(" "));
  const accessibleName = (el) => normalize(
    el.getAttribute("aria-label") || labelledByText(el) ||
    (el.labels ? [...el.labels].map((label) => label.innerText || label.textContent || "").join(" ") : "") ||
    el.getAttribute("alt") || el.innerText || el.value || el.getAttribute("placeholder")
  );
  const matchesText = (actual, expected) => locator.exact ? actual === expected : actual.includes(expected);
  const isVisible = (el) => {
    if (el.hidden || el.getAttribute("aria-hidden") === "true" || String(el.type).toLowerCase() === "hidden") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (typeof el.getClientRects !== "function" || el.getClientRects().length > 0);
  };
  const isEnabled = (el) => {
    if (el.disabled === true || el.getAttribute("aria-disabled") === "true") return false;
    return !el.closest?.("fieldset[disabled]");
  };
  const error = (code, message, data) => ({ ok: false, error: { code, message, ...(data ? { data } : {}) } });
  const boundedText = (value, maxChars) => {
    if (value == null) return { ok: true, value: null };
    const text = String(value);
    if (text.length > maxChars) return error("LOCATOR_RESULT_TOO_LARGE", `Locator text exceeds the ${maxChars} character limit`, { length: text.length, maxChars });
    return { ok: true, value: text };
  };

  let candidates;
  try {
    if (locator.css) candidates = [...document.querySelectorAll(locator.css)];
    else if (locator.testId) candidates = [...document.querySelectorAll(`[data-testid="${escapeAttribute(locator.testId)}"]`)];
    else candidates = [...document.querySelectorAll("*")];
  } catch (cause) {
    return error("INVALID_LOCATOR", "The locator contains an invalid CSS selector", { reason: String(cause?.message || cause) });
  }

  if (locator.role) candidates = candidates.filter((el) => implicitRole(el) === locator.role);
  if (locator.label) {
    const expected = normalize(locator.label);
    candidates = candidates.filter((el) => matchesText(accessibleName(el), expected));
  }
  if (locator.text) {
    const expected = normalize(locator.text);
    candidates = candidates.filter((el) => matchesText(normalize(el.innerText ?? el.textContent), expected));
  }
  if (locator.name) {
    const expected = normalize(locator.name);
    candidates = candidates.filter((el) => matchesText(accessibleName(el), expected));
  }

  if (operation === "count") return { ok: true, value: candidates.length };
  if (operation === "allTextContents") {
    const maxResults = Math.max(1, Math.min(Number(options.maxResults) || 100, 500));
    const maxCharsPerItem = Math.max(1, Math.min(Number(options.maxCharsPerItem) || 10000, 100000));
    const maxTotalChars = Math.max(1, Math.min(Number(options.maxTotalChars) || 100000, 500000));
    if (candidates.length > maxResults) return error("LOCATOR_RESULT_TOO_LARGE", `Locator matched more than ${maxResults} elements`, { count: candidates.length, maxResults });
    const values = [];
    let totalChars = 0;
    for (const el of candidates) {
      const value = String(el.textContent ?? "");
      if (value.length > maxCharsPerItem || totalChars + value.length > maxTotalChars) {
        return error("LOCATOR_RESULT_TOO_LARGE", "Locator text collection exceeds the configured size limit", { maxCharsPerItem, maxTotalChars });
      }
      values.push(value);
      totalChars += value.length;
    }
    return { ok: true, value: values };
  }

  if (candidates.length === 0 && (operation === "isVisible" || operation === "isEnabled")) return { ok: true, value: false };
  if (candidates.length === 0) return error("LOCATOR_NOT_FOUND", "No element matched the locator");
  if (candidates.length !== 1) return error("LOCATOR_AMBIGUOUS", `Locator matched ${candidates.length} elements`, { count: candidates.length });

  const element = candidates[0];
  const maxChars = Math.max(1, Math.min(Number(options.maxChars) || 100000, 500000));
  if (operation === "innerText") return boundedText(element.innerText ?? element.textContent ?? "", maxChars);
  if (operation === "textContent") return boundedText(element.textContent, maxChars);
  if (operation === "getAttribute") return boundedText(element.getAttribute(options.name), maxChars);
  if (operation === "isVisible") return { ok: true, value: isVisible(element) };
  if (operation === "isEnabled") return { ok: true, value: isEnabled(element) };
  return error("INVALID_PARAMS", `Unknown locator query operation: ${operation}`);
}

function locatorError(code, message, data) {
  return Object.assign(new Error(message), { code, data });
}
