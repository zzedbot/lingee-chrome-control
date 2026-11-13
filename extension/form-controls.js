export function normalizeSelections(value) {
  const list = Array.isArray(value) ? value : [value];
  if (!list.length) throw controlError("INVALID_PARAMS", "options must contain at least one selection");
  return list.map((selection) => {
    if (typeof selection === "string") return { value: selection };
    if (!selection || typeof selection !== "object" || Array.isArray(selection)) throw controlError("INVALID_PARAMS", "Each selection must be a string or {value, label, index}");
    const keys = Object.keys(selection);
    if (!keys.length || keys.some((key) => !["value", "label", "index"].includes(key))) throw controlError("INVALID_PARAMS", "Selection supports only value, label, or index");
    if (selection.value != null && typeof selection.value !== "string") throw controlError("INVALID_PARAMS", "selection.value must be a string");
    if (selection.label != null && typeof selection.label !== "string") throw controlError("INVALID_PARAMS", "selection.label must be a string");
    if (selection.index != null && (!Number.isInteger(selection.index) || selection.index < 0)) throw controlError("INVALID_PARAMS", "selection.index must be a non-negative integer");
    return selection;
  });
}

export function inspectLocatedControl(locator) {
  const query = (root, value) => value.css ? [...root.querySelectorAll(value.css)] : value.testId ? [...root.querySelectorAll(`[data-testid="${String(value.testId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)] : [...root.querySelectorAll("*")];
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const role = (el) => el.getAttribute("role") || ({ BUTTON: "button", SELECT: el.multiple ? "listbox" : "combobox", TEXTAREA: "textbox", INPUT: el.type === "checkbox" ? "checkbox" : el.type === "radio" ? "radio" : "textbox", A: el.hasAttribute("href") ? "link" : null }[el.tagName] || null);
  const name = (el) => normalize(el.getAttribute("aria-label") || (el.labels ? [...el.labels].map((label) => label.textContent || "").join(" ") : "") || el.innerText || el.value || el.placeholder);
  const matches = (actual, expected) => locator.exact ? actual === expected : actual.includes(expected);
  let items;
  try { items = query(document, locator); } catch { return { ok: false, code: "INVALID_LOCATOR", message: "Invalid CSS locator" }; }
  if (locator.role) items = items.filter((el) => role(el) === locator.role);
  if (locator.name || locator.label) items = items.filter((el) => matches(name(el), normalize(locator.name || locator.label)));
  if (locator.text) items = items.filter((el) => matches(normalize(el.innerText || el.textContent), normalize(locator.text)));
  if (items.length !== 1) return { ok: false, code: items.length ? "LOCATOR_AMBIGUOUS" : "LOCATOR_NOT_FOUND", message: `Locator matched ${items.length} controls`, data: { count: items.length } };
  const el = items[0];
  const style = getComputedStyle(el); const rect = el.getBoundingClientRect();
  return { ok: true, value: { tagName: el.tagName, type: String(el.type || "").toLowerCase(), visible: rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden", enabled: el.disabled !== true && el.getAttribute("aria-disabled") !== "true" && !el.closest("fieldset[disabled]"), editable: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el.isContentEditable, checked: typeof el.checked === "boolean" ? el.checked : undefined, multiple: el.multiple === true, value: "value" in el ? String(el.value ?? "") : String(el.textContent ?? ""), selectedValues: el instanceof HTMLSelectElement ? [...el.selectedOptions].map((option) => option.value) : [], selectedLabels: el instanceof HTMLSelectElement ? [...el.selectedOptions].map((option) => option.label) : [] } };
}

export function applySelectOptions(locator, selections) {
  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const role = (el) => el.getAttribute("role") || (el.tagName === "SELECT" ? (el.multiple ? "listbox" : "combobox") : null);
  const name = (el) => normalize(el.getAttribute("aria-label") || (el.labels ? [...el.labels].map((label) => label.textContent || "").join(" ") : "") || el.innerText || el.value);
  const matches = (actual, expected) => locator.exact ? actual === expected : actual.includes(expected);
  let candidates;
  try { candidates = locator.css ? [...document.querySelectorAll(locator.css)] : locator.testId ? [...document.querySelectorAll(`[data-testid="${String(locator.testId).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`)] : [...document.querySelectorAll("select")]; } catch { return { ok: false, code: "INVALID_LOCATOR", message: "Invalid CSS locator" }; }
  if (locator.role) candidates = candidates.filter((el) => role(el) === locator.role);
  if (locator.name || locator.label) candidates = candidates.filter((el) => matches(name(el), normalize(locator.name || locator.label)));
  if (locator.text) candidates = candidates.filter((el) => matches(normalize(el.innerText || el.textContent), normalize(locator.text)));
  if (candidates.length !== 1) return { ok: false, code: candidates.length ? "LOCATOR_AMBIGUOUS" : "LOCATOR_NOT_FOUND", message: `Locator matched ${candidates.length} controls`, data: { count: candidates.length } };
  const select = candidates[0];
  if (!(select instanceof HTMLSelectElement)) return { ok: false, code: "CONTROL_TYPE_MISMATCH", message: "Target is not a select element" };
  const chosen = [];
  for (const selection of selections) {
    const option = selection.index != null ? select.options[selection.index] : [...select.options].find((item) => selection.value != null ? item.value === selection.value : item.label === selection.label);
    if (!option) return { ok: false, code: "OPTION_NOT_FOUND", message: "A requested option was not found", data: selection };
    chosen.push(option);
  }
  for (const option of select.options) option.selected = chosen.includes(option);
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, values: [...select.selectedOptions].map((option) => option.value) };
}

function controlError(code, message) { return Object.assign(new Error(message), { code }); }
