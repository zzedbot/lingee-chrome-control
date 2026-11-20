import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertExpectation,
  executeWorkflowCommand,
  parseWorkflowArgs,
  resolveWorkflowVariables,
  runWorkflow,
  substituteVariables,
  validateWorkflowFile
} from "../skills/lingee-browser-control/scripts/run-workflow.mjs";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const skillRoot = join(repoRoot, "skills", "lingee-browser-control");

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(skillRoot, relativePath), "utf8"));
}

test("bundled KDesign and Kingdee business workflows use the standard allowlisted control surface", async () => {
  for (const relativePath of ["examples/kdesign-components.json", "examples/kdesign-pro-pages.json", "examples/kingdee-business-page.json"]) {
    const document = validateWorkflowFile(await readJson(relativePath));
    assert.equal(document.schemaVersion, 1);
    assert.ok(document.workflows.length >= 4);
    const result = await executeWorkflowCommand({ mode: "validate", file: join(skillRoot, relativePath) });
    assert.deepEqual(result.workflowIds, document.workflows.map(({ id }) => id));
  }
});

test("workflow validation blocks raw CDP, page-script, and unknown methods before connection", () => {
  for (const method of ["browser.cdp", "Runtime.evaluate", "browser.evaluate", "kdesign.selectOption"]) {
    assert.throws(
      () => validateWorkflowFile({ schemaVersion: 1, workflows: [{ id: "unsafe", steps: [{ id: "escape", method, params: {} }] }] }),
      (error) => error.code === "NONSTANDARD_BROWSER_CONTROL_BLOCKED" && error.details.method === method
    );
  }
});

test("workflow variables preserve typed locator objects and tab ids", () => {
  assert.deepEqual(
    substituteVariables({ tabId: "$TAB_ID", locator: "$LOCATOR", literal: "prefix-$TAB_ID" }, { TAB_ID: 17, LOCATOR: { testId: "save" } }),
    { tabId: 17, locator: { testId: "save" }, literal: "prefix-$TAB_ID" }
  );
  assert.throws(() => substituteVariables("$MISSING", {}), (error) => error.code === "WORKFLOW_VARIABLE_MISSING");
});

test("workflow execution keeps one stable session and checks each expected result", async () => {
  const calls = [];
  const document = {
    schemaVersion: 1,
    workflows: [{
      id: "read-state",
      defaults: { LOCATOR: { testId: "result" }, EXPECTED: "完成" },
      steps: [
        { id: "read", method: "browser.locatorTextContent", params: { tabId: "$TAB_ID", locator: "$LOCATOR", maxChars: 100 }, expect: { includes: "$EXPECTED" } },
        { id: "count", method: "browser.locatorCount", params: { tabId: "$TAB_ID", locator: "$LOCATOR" }, expect: { path: "count", min: 1, max: 1 } }
      ]
    }]
  };
  const result = await runWorkflow(document, { workflowId: "read-state", tabId: 42, timeoutMs: 2000 }, {
    env: { LINGEE_BROWSER_INSTANCE_ID: "instance-test" },
    async runInvocation(invocation, dependencies) {
      calls.push({ invocation, sessionId: dependencies.env.LINGEE_BROWSER_SESSION_ID });
      return invocation.method === "browser.locatorCount" ? { count: 1 } : "任务已完成";
    }
  });
  assert.equal(result.steps.length, 2);
  assert.match(result.sessionId, /^workflow-/);
  assert.equal(new Set(calls.map(({ sessionId }) => sessionId)).size, 1);
  assert.equal(calls[0].invocation.params.tabId, 42);
  assert.equal(calls[0].invocation.timeoutMs, 2000);
});

test("workflow expectations report deterministic structured failures", () => {
  assert.equal(assertExpectation({ text: "销售部" }, { path: "text", equals: "销售部", includes: "销售" }), "销售部");
  assert.doesNotThrow(() => assertExpectation({ first: 1, second: 2 }, { equals: { second: 2, first: 1 } }));
  assert.throws(
    () => validateWorkflowFile({ schemaVersion: 1, workflows: [{ id: "bad-regex", steps: [{ id: "read", method: "browser.locatorTextContent", params: { tabId: 1 }, expect: { matches: "[" } }] }] }),
    (error) => error.code === "WORKFLOW_SCHEMA_INVALID"
  );
  assert.throws(
    () => assertExpectation({ count: 0 }, { path: "count", min: 1 }, { workflowId: "query", stepId: "verify" }),
    (error) => error.code === "WORKFLOW_EXPECTATION_FAILED" && error.details.actual === 0
  );
});

test("workflow command parser accepts typed variables and rejects incomplete runs", () => {
  assert.deepEqual(
    parseWorkflowArgs(["run", "workflow.json", "--workflow", "query-list", "--tab-id", "7", "--var", "KEYWORD=\"测试\"", "--var", "LOCATOR={\"testId\":\"field\"}"]),
    {
      mode: "run",
      file: join(process.cwd(), "workflow.json"),
      workflowId: "query-list",
      tabId: 7,
      variables: { KEYWORD: "测试", LOCATOR: { testId: "field" } }
    }
  );
  assert.deepEqual(
    parseWorkflowArgs(["run", "workflow.json", "--workflow", "query-list", "--tab-id", "7", "--vars-stdin"]),
    {
      mode: "run",
      file: join(process.cwd(), "workflow.json"),
      workflowId: "query-list",
      tabId: 7,
      variables: {},
      variablesInput: { kind: "stdin" }
    }
  );
  assert.throws(() => parseWorkflowArgs(["run", "workflow.json", "--workflow", "query-list"]), (error) => error.code === "INVALID_ARGUMENTS");
  assert.throws(
    () => parseWorkflowArgs(["run", "workflow.json", "--workflow", "query-list", "--tab-id", "7", "--var", "A=1", "--vars-stdin"]),
    (error) => error.code === "INVALID_ARGUMENTS"
  );
});

test("workflow variables accept stdin and file objects without shell JSON", async () => {
  assert.deepEqual(
    await resolveWorkflowVariables(
      { variablesInput: { kind: "stdin" } },
      { readStdin: async () => '{"KEYWORD":"测试","LOCATOR":{"testId":"field"}}' }
    ),
    { KEYWORD: "测试", LOCATOR: { testId: "field" } }
  );
  assert.deepEqual(
    await resolveWorkflowVariables(
      { variablesInput: { kind: "file", path: "vars.json" } },
      { readVariablesFile: async () => '\uFEFF{"TAB_NAME":"应用"}' }
    ),
    { TAB_NAME: "应用" }
  );
  await assert.rejects(
    () => resolveWorkflowVariables(
      { variablesInput: { kind: "stdin" } },
      { readStdin: async () => '{\\"KEYWORD\\":\\"测试\\"}' }
    ),
    (error) => error.code === "INVALID_ARGUMENTS"
  );
});
