export const CAPABILITY_CASES = Object.freeze([
  { methods: ["instances"], layer: "bridge", mode: "runtime", case: "discover exactly one or explicitly selected Bridge instance" },
  { methods: ["bridge.getInfo", "browser.getInfo"], layer: "bridge", mode: "runtime", case: "read Bridge, extension and browser capability identity" },
  { methods: ["policy.get"], layer: "policy", mode: "runtime", case: "read effective policy without changing it" },
  { methods: ["policy.allowHost", "policy.blockHost", "policy.setAllowAll", "policy.setSensitiveMetadata"], layer: "policy", mode: "contract", case: "covered by policy unit tests; never mutate user policy from a web fixture" },
  { methods: ["browser.listTabs", "browser.getTab", "browser.openTab", "browser.activateTab", "browser.groupTabs", "browser.closeTab"], layer: "tabs", mode: "runtime", case: "create, inspect, activate, group and close two fixture tabs" },
  { methods: ["browser.claimTab", "browser.getLease", "browser.detachTab"], layer: "control", mode: "runtime", case: "enforce non-secret session leases and debugger-backed control" },
  { methods: ["browser.transferTab", "browser.endSession"], layer: "control", mode: "contract", case: "transfer/release semantics are covered by session-manager and Host integration tests" },
  { methods: ["browser.markHandoff", "browser.markDeliverable"], layer: "tab-lifecycle", mode: "runtime", case: "preserve marked temporary tabs while cleaning safe unmarked session tabs" },
  { methods: ["browser.navigate", "browser.back", "browser.forward", "browser.reload"], layer: "navigation", mode: "runtime", case: "navigate between deterministic routes and verify each resulting page" },
  { methods: ["browser.readText", "browser.domSnapshot", "browser.accessibilitySnapshot", "browser.screenshot"], layer: "observation", mode: "runtime", case: "observe bounded text, DOM, AX tree and PNG screenshot" },
  { methods: ["browser.locatorCount", "browser.locatorAllTextContents", "browser.locatorInnerText", "browser.locatorTextContent", "browser.locatorGetAttribute", "browser.locatorIsVisible", "browser.locatorIsEnabled"], layer: "locator-query", mode: "runtime", case: "query bounded collection text and strict element text, attributes, visibility and enabled state" },
  { methods: ["browser.waitFor"], layer: "locator-wait", mode: "runtime", case: "wait for asynchronous top-level, nested-frame and detached-frame element states" },
  { methods: ["browser.waitForURL", "browser.waitForLoadState", "browser.expectNavigation"], layer: "navigation-wait", mode: "runtime", case: "bind navigation listeners before SPA, full-document and redirect actions and verify bounded timeouts" },
  { methods: ["browser.click", "browser.fill", "browser.press", "browser.type", "browser.check", "browser.uncheck", "browser.setChecked", "browser.selectOption", "browser.doubleClick", "browser.pressSequentially"], layer: "semantic-input", mode: "runtime", case: "exercise native form controls and sequential/double-click input with state readback" },
  { methods: ["browser.mouseMove", "browser.coordinateClick", "browser.drag"], layer: "pointer", mode: "runtime", case: "move, coordinate-click and drag while preserving cursor binding" },
  { methods: ["browser.wheel", "browser.scroll"], layer: "scroll", mode: "runtime", case: "dispatch visible wheel feedback and page scrolling" },
  { methods: ["browser.setFileInput", "browser.waitForFileChooser", "browser.setFileChooserFiles"], layer: "file", mode: "runtime", case: "capture file chooser lifecycle and assign validated files in top-level and framed inputs" },
  { methods: ["browser.waitForDownload", "browser.downloadMedia"], layer: "download", mode: "runtime", case: "register download expectations before reviewed actions and restrict direct media targets" },
  { methods: ["browser.getDialog", "browser.handleDialog"], layer: "dialog", mode: "runtime", case: "read a stable dialog identity, accept confirm and supply prompt text" },
  { methods: ["browser.getEvents"], layer: "events", mode: "runtime", case: "read buffered events through a sequence cursor" },
  { methods: ["browser.getConsoleLogs"], layer: "console", mode: "runtime", case: "read filtered bounded structured logs without object handles" },
  { methods: ["browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"], layer: "sensitive-metadata", mode: "runtime-or-gate", case: "query only when already enabled; otherwise assert the approval gate" }
]);

export const coveredMethods = () => new Set(CAPABILITY_CASES.flatMap(({ methods }) => methods));
