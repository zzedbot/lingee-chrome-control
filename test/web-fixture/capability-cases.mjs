export const CAPABILITY_CASES = Object.freeze([
  { methods: ["instances"], layer: "bridge", mode: "runtime", case: "discover exactly one or explicitly selected Bridge instance" },
  { methods: ["bridge.getInfo", "browser.getInfo"], layer: "bridge", mode: "runtime", case: "read Bridge, extension and browser capability identity" },
  { methods: ["policy.get"], layer: "policy", mode: "runtime", case: "read effective policy without changing it" },
  { methods: ["policy.allowHost", "policy.blockHost", "policy.setAllowAll", "policy.setSensitiveMetadata"], layer: "policy", mode: "contract", case: "covered by policy unit tests; never mutate user policy from a web fixture" },
  { methods: ["browser.listTabs", "browser.getTab", "browser.openTab", "browser.activateTab", "browser.groupTabs", "browser.closeTab"], layer: "tabs", mode: "runtime", case: "create, inspect, activate, group and close two fixture tabs" },
  { methods: ["browser.claimTab", "browser.detachTab"], layer: "control", mode: "runtime", case: "attach and release debugger-backed control with the visible cursor" },
  { methods: ["browser.navigate", "browser.back", "browser.forward", "browser.reload"], layer: "navigation", mode: "runtime", case: "navigate between deterministic routes and verify each resulting page" },
  { methods: ["browser.readText", "browser.domSnapshot", "browser.accessibilitySnapshot", "browser.screenshot"], layer: "observation", mode: "runtime", case: "observe bounded text, DOM, AX tree and PNG screenshot" },
  { methods: ["browser.locatorCount", "browser.locatorAllTextContents", "browser.locatorInnerText", "browser.locatorTextContent", "browser.locatorGetAttribute", "browser.locatorIsVisible", "browser.locatorIsEnabled"], layer: "locator-query", mode: "runtime", case: "query bounded collection text and strict element text, attributes, visibility and enabled state" },
  { methods: ["browser.click", "browser.fill", "browser.press", "browser.type"], layer: "semantic-input", mode: "runtime", case: "exercise unique native and KDesign semantic controls with state readback" },
  { methods: ["browser.mouseMove", "browser.coordinateClick", "browser.drag"], layer: "pointer", mode: "runtime", case: "move, coordinate-click and drag while preserving cursor binding" },
  { methods: ["browser.wheel", "browser.scroll"], layer: "scroll", mode: "runtime", case: "dispatch visible wheel feedback and page scrolling" },
  { methods: ["browser.setFileInput"], layer: "file", mode: "runtime", case: "assign the repository test file and verify its filename" },
  { methods: ["browser.getDialog", "browser.handleDialog"], layer: "dialog", mode: "runtime", case: "read a stable dialog identity, accept confirm and supply prompt text" },
  { methods: ["browser.getEvents"], layer: "events", mode: "runtime", case: "read buffered events through a sequence cursor" },
  { methods: ["browser.historySearch", "browser.bookmarkSearch", "browser.downloadsSearch"], layer: "sensitive-metadata", mode: "runtime-or-gate", case: "query only when already enabled; otherwise assert the approval gate" }
]);

export const coveredMethods = () => new Set(CAPABILITY_CASES.flatMap(({ methods }) => methods));
