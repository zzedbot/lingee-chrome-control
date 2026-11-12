const object = (properties = {}, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const tabId = { tabId: { type: "integer", minimum: 0, description: "Chrome tab ID" } };
const locator = {
  type: "object",
  description: "A CSS, role/name, label, text, or data-testid locator. It must resolve to one visible element.",
  properties: {
    css: { type: "string" }, role: { type: "string" }, name: { type: "string" }, label: { type: "string" },
    text: { type: "string" }, testId: { type: "string" }, exact: { type: "boolean" }
  },
  additionalProperties: false
};
const point = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, locator },
  additionalProperties: false
};
const locatorTextLimit = { maxChars: { type: "integer", minimum: 1, maximum: 500000 } };

const INPUT_METHODS = new Set([
  "browser.click", "browser.fill", "browser.press", "browser.type", "browser.mouseMove",
  "browser.coordinateClick", "browser.drag", "browser.wheel", "browser.scroll", "browser.setFileInput",
  "browser.handleDialog"
]);
const SENSITIVE_METADATA_METHODS = new Set([
  "browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"
]);
const LONG_TIMEOUT_METHODS = new Set([
  "browser.claimTab", "browser.navigate", "browser.reload", "browser.screenshot", "browser.setFileInput"
]);

function capability(name, description, method, inputSchema, documentation, extra = {}) {
  const properties = inputSchema.properties ?? {};
  return {
    name,
    description,
    method,
    inputSchema,
    control: {
      scope: method?.startsWith("policy.") ? "policy" : method?.startsWith("browser.") ? "browser" : "bridge",
      requiresTabId: Object.hasOwn(properties, "tabId") && (inputSchema.required ?? []).includes("tabId"),
      producesInput: INPUT_METHODS.has(method),
      sensitiveMetadata: SENSITIVE_METADATA_METHODS.has(method),
      timeoutCategory: LONG_TIMEOUT_METHODS.has(method) ? "long" : "default"
    },
    documentation,
    ...extra
  };
}

export const STANDARD_CAPABILITIES = Object.freeze([
  capability("bridge_list_instances", "List running Chrome bridge instances.", null, object(), ["Array of public instance descriptors: instance ID, PID, transport, host name, and start time.", "Discover first; the result never includes endpoint, token, or unknown descriptor fields."]),
  capability("bridge_status", "Get bridge and Chrome extension connection status.", "bridge.getInfo", object(), ["Bridge identity, selected instance, transport, and extension handshake state.", "Call only after instance selection."]),
  capability("policy_get", "Read the effective local browser security policy.", "policy.get", object(), ["Effective allowlist, blocklist, global gates, and CDP allowlist.", "Read before requesting a policy change."]),
  capability("policy_allow_host", "Allow an HTTP(S) host and its subdomains.", "policy.allowHost", object({ host: { type: "string" } }, ["host"]), ["Saved effective policy.", "Allow the exact HTTP(S) host and subdomains only after explicit user approval."]),
  capability("policy_block_host", "Block an HTTP(S) host and its subdomains.", "policy.blockHost", object({ host: { type: "string" } }, ["host"]), ["Saved effective policy.", "Block the host and its subdomains; the blocklist wins."]),
  capability("policy_set_allow_all", "Enable or disable access to all sites. Use only with explicit user approval.", "policy.setAllowAll", object({ enabled: { type: "boolean" } }, ["enabled"]), ["Saved effective policy.", "Global site access requires explicit user approval; keep disabled by default."]),
  capability("policy_set_sensitive_metadata", "Enable or disable history, bookmark, and download metadata access.", "policy.setSensitiveMetadata", object({ enabled: { type: "boolean" } }, ["enabled"]), ["Saved effective policy.", "History, bookmark, and download metadata access requires explicit user approval."]),
  capability("browser_get_info", "Get browser backend identity and capabilities.", "browser.getInfo", object(), ["Browser backend identity, version, and capability list.", "Read-only capability discovery."]),
  capability("browser_list_tabs", "List tabs. Details for unapproved sites are redacted.", "browser.listTabs", object({ query: { type: "object", additionalProperties: true } }), ["Array of Chrome tab records.", "Unapproved-site details are redacted."]),
  capability("browser_get_tab", "Get one tab. Details for an unapproved site are redacted.", "browser.getTab", object(tabId, ["tabId"]), ["One Chrome tab record.", "Unapproved-site details are redacted."]),
  capability("browser_open_tab", "Open an approved URL in a new tab.", "browser.openTab", object({ url: { type: "string" }, active: { type: "boolean" }, windowId: { type: "integer" } }, ["url"]), ["Created Chrome tab record.", "The target URL must be approved."]),
  capability("browser_close_tab", "Close a tab.", "browser.closeTab", object(tabId, ["tabId"]), ["Closure confirmation.", "Confirm first if unsaved work may be lost."]),
  capability("browser_activate_tab", "Activate a tab and focus its window.", "browser.activateTab", object(tabId, ["tabId"]), ["Activated tab record.", "Also focuses its Chrome window."]),
  capability("browser_claim_tab", "Attach the debugger-backed control session to an approved tab.", "browser.claimTab", object(tabId, ["tabId"]), ["Claimed tab record.", "Installs the controlled-tab foreign-frame monitor, then attaches debugger-backed control to an approved tab."]),
  capability("browser_detach_tab", "Detach debugger-backed control from a tab.", "browser.detachTab", object(tabId, ["tabId"]), ["Detach confirmation.", "Releases debugger-backed control."]),
  capability("browser_navigate", "Navigate a tab to an approved URL.", "browser.navigate", object({ ...tabId, url: { type: "string" } }, ["tabId", "url"]), ["Updated tab record.", "The target URL must be approved."]),
  capability("browser_back", "Navigate a tab backward.", "browser.back", object(tabId, ["tabId"]), ["Navigation acknowledgement.", "Verify the resulting state."]),
  capability("browser_forward", "Navigate a tab forward.", "browser.forward", object(tabId, ["tabId"]), ["Navigation acknowledgement.", "Verify the resulting state."]),
  capability("browser_reload", "Reload a tab.", "browser.reload", object({ ...tabId, bypassCache: { type: "boolean" } }, ["tabId"]), ["Reload acknowledgement.", "Verify whether prior mutations already occurred."]),
  capability("browser_group_tabs", "Create or update a Chrome tab group.", "browser.groupTabs", object({ tabIds: { type: "array", items: { type: "integer" }, minItems: 1 }, groupId: { type: "integer" }, title: { type: "string" }, color: { type: "string" }, collapsed: { type: "boolean" } }, ["tabIds"]), ["Chrome tab-group record.", "Group only the intended tabs."]),
  capability("browser_read_text", "Read title, URL, and visible page text.", "browser.readText", object({ ...tabId, maxChars: { type: "integer", minimum: 1, maximum: 500000 } }, ["tabId"]), ["URL, title, and bounded visible body text.", "Prefer this for lightweight observation."]),
  capability("browser_dom_snapshot", "Read a compact DOM/interaction snapshot for locator construction.", "browser.domSnapshot", object({ ...tabId, maxNodes: { type: "integer", minimum: 1, maximum: 5000 }, maxTextChars: { type: "integer", minimum: 100, maximum: 200000 } }, ["tabId"]), ["Compact interactive DOM nodes and page metadata.", "Use to construct stable locators."]),
  capability("browser_locator_count", "Count all elements matching an explicit locator without changing page state.", "browser.locatorCount", object({ ...tabId, locator }, ["tabId", "locator"]), ["Number of elements matching the locator, including hidden elements.", "Read-only; the locator must include at least one selector field."]),
  capability("browser_locator_all_text_contents", "Read bounded textContent values for every element matching an explicit locator.", "browser.locatorAllTextContents", object({ ...tabId, locator, maxResults: { type: "integer", minimum: 1, maximum: 500 }, maxCharsPerItem: { type: "integer", minimum: 1, maximum: 100000 }, maxTotalChars: { type: "integer", minimum: 1, maximum: 500000 } }, ["tabId", "locator"]), ["Bounded array of textContent strings for all matches.", "Read-only; fails closed when configured result limits would be exceeded."]),
  capability("browser_locator_inner_text", "Read bounded innerText from one uniquely matched element.", "browser.locatorInnerText", object({ ...tabId, locator, ...locatorTextLimit }, ["tabId", "locator"]), ["Bounded innerText string from one unique match.", "Read-only; zero and multiple matches return stable locator errors."]),
  capability("browser_locator_text_content", "Read bounded textContent from one uniquely matched element.", "browser.locatorTextContent", object({ ...tabId, locator, ...locatorTextLimit }, ["tabId", "locator"]), ["Bounded textContent string or null from one unique match.", "Read-only; zero and multiple matches return stable locator errors."]),
  capability("browser_locator_get_attribute", "Read one bounded attribute value from a uniquely matched element.", "browser.locatorGetAttribute", object({ ...tabId, locator, name: { type: "string", minLength: 1 }, ...locatorTextLimit }, ["tabId", "locator", "name"]), ["Bounded attribute string or null from one unique match.", "Read-only; does not expose properties or object handles."]),
  capability("browser_locator_is_visible", "Test whether one locator currently resolves to a visible element.", "browser.locatorIsVisible", object({ ...tabId, locator }, ["tabId", "locator"]), ["Boolean visibility result; false when no element matches.", "Read-only; multiple matches return LOCATOR_AMBIGUOUS."]),
  capability("browser_locator_is_enabled", "Test whether one locator currently resolves to an enabled element.", "browser.locatorIsEnabled", object({ ...tabId, locator }, ["tabId", "locator"]), ["Boolean enabled result; false when no element matches.", "Read-only; honors disabled controls, aria-disabled, and disabled fieldsets."]),
  capability("browser_accessibility_snapshot", "Read the Chrome accessibility tree.", "browser.accessibilitySnapshot", object(tabId, ["tabId"]), ["Chrome accessibility tree.", "Use for accessible roles, names, and state."]),
  capability("browser_screenshot", "Capture a tab screenshot.", "browser.screenshot", object({ ...tabId, format: { enum: ["png", "jpeg"] }, quality: { type: "integer", minimum: 0, maximum: 100 }, captureBeyondViewport: { type: "boolean" } }, ["tabId"]), ["MCP image content with MIME type.", "Capture sensitive visual data only when needed."], { imageResult: true }),
  capability("browser_click", "Click one element with synchronized visible pointer movement and feedback. Use this for user-visible element clicks; do not replace it with raw CDP or page JavaScript.", "browser.click", object({ ...tabId, locator, button: { enum: ["left", "middle", "right"] }, clickCount: { type: "integer", minimum: 1, maximum: 3 } }, ["tabId", "locator"]), ["Click result for the uniquely resolved element.", "Use a stable visible locator and verify afterward."]),
  capability("browser_fill", "Focus, clear, and fill one input with synchronized visible pointer feedback.", "browser.fill", object({ ...tabId, locator, value: { type: "string" } }, ["tabId", "locator", "value"]), ["Fill result for the uniquely resolved input.", "Never supply secrets."]),
  capability("browser_press", "Dispatch a keyboard key to the active element.", "browser.press", object({ ...tabId, key: { type: "string" }, modifiers: { type: "array", items: { enum: ["alt", "control", "meta", "shift"] } } }, ["tabId", "key"]), ["Key-dispatch acknowledgement.", "Ensure the intended element has focus."]),
  capability("browser_type", "Insert text into the currently focused element.", "browser.type", object({ ...tabId, text: { type: "string" } }, ["tabId", "text"]), ["Typed flag and inserted-text length.", "Insert only non-secret text into the focused element."]),
  capability("browser_mouse_move", "Move the visible virtual pointer and dispatch mouse movement only after the animation reaches the viewport coordinates.", "browser.mouseMove", object({ ...tabId, x: { type: "number" }, y: { type: "number" } }, ["tabId", "x", "y"]), ["Final viewport coordinates.", "Use only with current viewport evidence. The extension paints and verifies movement before dispatching input."]),
  capability("browser_coordinate_click", "Click viewport coordinates with synchronized visible pointer movement and feedback for vision-guided interaction.", "browser.coordinateClick", object({ ...tabId, x: { type: "number" }, y: { type: "number" }, button: { enum: ["left", "middle", "right"] }, clickCount: { type: "integer", minimum: 1, maximum: 3 } }, ["tabId", "x", "y"]), ["Clicked coordinates, button, and count.", "Use only after semantic retries and a fresh screenshot. Visual pressed/click feedback is part of the operation."]),
  capability("browser_drag", "Drag between viewport points or uniquely resolved locators with synchronized visible pointer steps.", "browser.drag", object({ ...tabId, from: point, to: point, steps: { type: "integer", minimum: 2, maximum: 60 } }, ["tabId", "from", "to"]), ["Drag result with resolved endpoints.", "Use current points or unique locators. Each visual drag step precedes its input event."]),
  capability("browser_wheel", "Dispatch a wheel event only after its visible pointer feedback is painted at viewport coordinates.", "browser.wheel", object({ ...tabId, x: { type: "number" }, y: { type: "number" }, deltaX: { type: "number" }, deltaY: { type: "number" } }, ["tabId", "x", "y"]), ["Wheel-dispatch acknowledgement.", "Coordinates refer to the current viewport. Wheel feedback must paint before dispatch."]),
  capability("browser_scroll", "Scroll a page by CSS pixels only after visible scroll feedback is painted.", "browser.scroll", object({ ...tabId, deltaX: { type: "number" }, deltaY: { type: "number" } }, ["tabId"]), ["Resulting page scroll coordinates.", "Re-read state after scrolling. Scroll feedback must paint before the page moves."]),
  capability("browser_set_file_input", "Set files on a CSS-selected file input.", "browser.setFileInput", object({ ...tabId, selector: { type: "string" }, files: { type: "array", items: { type: "string" }, minItems: 1 } }, ["tabId", "selector", "files"]), ["File-input assignment result.", "Verify the selector and exact file scope first."]),
  capability("browser_get_dialog", "Read the active JavaScript dialog registered for a controlled tab.", "browser.getDialog", object(tabId, ["tabId"]), ["Active dialog identity, type, message, URL, and prompt default, or null.", "Read after an action reports dialogOpened; use its ID when handling the dialog."]),
  capability("browser_handle_dialog", "Accept or dismiss the active JavaScript dialog.", "browser.handleDialog", object({ ...tabId, dialogId: { type: "string" }, accept: { type: "boolean" }, promptText: { type: "string" } }, ["tabId"]), ["Handled dialog identity and acknowledgement after the close event.", "Confirm consequential accept or dismiss choices. Pass dialogId to reject stale dialog decisions."]),
  capability("browser_get_events", "Read buffered debugger events using a sequence cursor.", "browser.getEvents", object({ tabId: { type: "integer" }, afterSequence: { type: "integer", minimum: 0 }, limit: { type: "integer", minimum: 1, maximum: 500 }, methods: { type: "array", items: { type: "string" } } }, ["tabId"]), ["Buffered events with cursor, pagination, and truncation state.", "Continue from the returned sequence cursor."]),
  capability("browser_history_search", "Search browser history when sensitive metadata access is enabled.", "browser.historySearch", object({ text: { type: "string" }, startTime: { type: "number" }, endTime: { type: "number" }, maxResults: { type: "integer" } }), ["Array of Chrome history records.", "Sensitive history metadata requires explicit user approval."]),
  capability("browser_bookmark_search", "Search bookmarks when sensitive metadata access is enabled.", "browser.bookmarkSearch", object({ query: { oneOf: [{ type: "string" }, { type: "object", additionalProperties: true }] }, text: { type: "string" } }), ["Array of Chrome bookmark records.", "Sensitive bookmark metadata requires explicit user approval."]),
  capability("browser_downloads_search", "Search download metadata when sensitive metadata access is enabled.", "browser.downloadsSearch", object({ query: { type: "object", additionalProperties: true } }), ["Array of Chrome download metadata records.", "Sensitive download metadata requires explicit user approval."])
]);

export const STANDARD_BRIDGE_METHODS = new Set(
  STANDARD_CAPABILITIES.map(({ method }) => method).filter(Boolean)
);

export function renderToolMappingTable(capabilities = STANDARD_CAPABILITIES) {
  const formatParameters = (names) => names.length ? names.map((name) => `\`${name}\``).join(", ") : "—";
  const lines = [
    "| Direct MCP tool | Bridge method / CLI target | Required parameters | Optional parameters | Result summary | Use and approval boundary |",
    "|---|---|---|---|---|---|"
  ];
  for (const entry of capabilities) {
    const required = entry.inputSchema.required ?? [];
    const optional = Object.keys(entry.inputSchema.properties ?? {}).filter((name) => !required.includes(name));
    lines.push(`| \`${entry.name}\` | \`${entry.method ?? "instances"}\` | ${formatParameters(required)} | ${formatParameters(optional)} | ${entry.documentation[0]} | ${entry.documentation[1]} |`);
  }
  return lines.join("\n");
}
