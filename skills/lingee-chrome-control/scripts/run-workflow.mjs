#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { runInvocation, normalizeError } from "./invoke.mjs";
import { STANDARD_BRIDGE_METHODS } from "./runtime/standard-capabilities.mjs";

const usage = "node run-workflow.mjs list|validate <workflow.json> | node run-workflow.mjs run <workflow.json> --workflow <id> --tab-id <id> [--var NAME=JSON] [--timeout-ms <ms>]";
const expectationKeys = new Set(["path", "equals", "includes", "matches", "min", "max"]);

export function parseWorkflowArgs(argv) {
  const [mode, file, ...rest] = argv;
  if (!file || !["list", "validate", "run"].includes(mode)) throw workflowError("Invalid workflow arguments.", "INVALID_ARGUMENTS", { usage });
  if (mode !== "run") {
    if (rest.length) throw workflowError("Invalid workflow arguments.", "INVALID_ARGUMENTS", { usage });
    return { mode, file: path.resolve(file) };
  }

  const parsed = { mode, file: path.resolve(file), variables: {} };
  for (let index = 0; index < rest.length;) {
    const flag = rest[index++];
    const value = rest[index++];
    if (value === undefined) throw workflowError(`Missing value for ${flag}.`, "INVALID_ARGUMENTS", { usage });
    if (flag === "--workflow") parsed.workflowId = value;
    else if (flag === "--tab-id") {
      parsed.tabId = Number(value);
      if (!Number.isSafeInteger(parsed.tabId) || parsed.tabId < 0) throw workflowError("--tab-id must be a non-negative safe integer.", "INVALID_ARGUMENTS", { usage });
    } else if (flag === "--timeout-ms") {
      parsed.timeoutMs = Number(value);
      if (!Number.isSafeInteger(parsed.timeoutMs) || parsed.timeoutMs <= 0) throw workflowError("--timeout-ms must be a positive safe integer.", "INVALID_ARGUMENTS", { usage });
    } else if (flag === "--var") {
      const separator = value.indexOf("=");
      if (separator <= 0) throw workflowError("--var must use NAME=JSON syntax.", "INVALID_ARGUMENTS", { usage });
      const name = value.slice(0, separator);
      if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw workflowError(`Invalid variable name: ${name}`, "INVALID_ARGUMENTS", { usage });
      const source = value.slice(separator + 1);
      try { parsed.variables[name] = JSON.parse(source); }
      catch { parsed.variables[name] = source; }
    } else throw workflowError(`Unknown option: ${flag}`, "INVALID_ARGUMENTS", { usage });
  }
  if (!parsed.workflowId || parsed.tabId === undefined) throw workflowError("--workflow and --tab-id are required.", "INVALID_ARGUMENTS", { usage });
  return parsed;
}

export async function loadWorkflowFile(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { throw workflowError(`Unable to read workflow file: ${error.message}`, "WORKFLOW_FILE_INVALID", { file }); }
}

export function validateWorkflowFile(document) {
  if (!isPlainObject(document) || document.schemaVersion !== 1 || !Array.isArray(document.workflows) || document.workflows.length === 0)
    throw workflowError("Workflow file must use schemaVersion 1 and contain a non-empty workflows array.", "WORKFLOW_SCHEMA_INVALID");
  const workflowIds = new Set();
  for (const workflow of document.workflows) {
    if (!isPlainObject(workflow) || typeof workflow.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(workflow.id))
      throw workflowError("Each workflow needs a lowercase kebab-case id.", "WORKFLOW_SCHEMA_INVALID");
    if (workflowIds.has(workflow.id)) throw workflowError(`Duplicate workflow id: ${workflow.id}`, "WORKFLOW_SCHEMA_INVALID");
    workflowIds.add(workflow.id);
    if (workflow.defaults !== undefined && !isPlainObject(workflow.defaults)) throw workflowError(`Workflow ${workflow.id} defaults must be an object.`, "WORKFLOW_SCHEMA_INVALID");
    if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) throw workflowError(`Workflow ${workflow.id} needs at least one step.`, "WORKFLOW_SCHEMA_INVALID");
    const stepIds = new Set();
    for (const step of workflow.steps) validateStep(workflow.id, step, stepIds);
  }
  return document;
}

function validateStep(workflowId, step, stepIds) {
  if (!isPlainObject(step) || typeof step.id !== "string" || !/^[a-z][a-z0-9-]*$/.test(step.id))
    throw workflowError(`Workflow ${workflowId} has a step without a lowercase kebab-case id.`, "WORKFLOW_SCHEMA_INVALID");
  if (stepIds.has(step.id)) throw workflowError(`Duplicate step id in ${workflowId}: ${step.id}`, "WORKFLOW_SCHEMA_INVALID");
  stepIds.add(step.id);
  if (!STANDARD_BRIDGE_METHODS.has(step.method))
    throw workflowError(`Nonstandard Bridge method is not allowed: ${step.method}`, "NONSTANDARD_BROWSER_CONTROL_BLOCKED", { workflowId, stepId: step.id, method: step.method });
  if (!isPlainObject(step.params)) throw workflowError(`Step ${workflowId}/${step.id} params must be an object.`, "WORKFLOW_SCHEMA_INVALID");
  if (step.expect !== undefined) validateExpectation(workflowId, step.id, step.expect);
}

function validateExpectation(workflowId, stepId, expectation) {
  if (!isPlainObject(expectation)) throw workflowError(`Step ${workflowId}/${stepId} expectation must be an object.`, "WORKFLOW_SCHEMA_INVALID");
  for (const key of Object.keys(expectation)) if (!expectationKeys.has(key)) throw workflowError(`Unknown expectation operator: ${key}`, "WORKFLOW_SCHEMA_INVALID");
  if (Object.keys(expectation).every((key) => key === "path")) throw workflowError(`Step ${workflowId}/${stepId} expectation has no assertion.`, "WORKFLOW_SCHEMA_INVALID");
  if (expectation.path !== undefined && (typeof expectation.path !== "string" || expectation.path.split(".").some((part) => !part)))
    throw workflowError(`Step ${workflowId}/${stepId} expectation path is invalid.`, "WORKFLOW_SCHEMA_INVALID");
  if (expectation.matches !== undefined) {
    if (typeof expectation.matches !== "string" || expectation.matches.length > 1000) throw workflowError("matches must be a string no longer than 1000 characters.", "WORKFLOW_SCHEMA_INVALID");
    try { new RegExp(expectation.matches); } catch { throw workflowError("matches must be a valid regular expression.", "WORKFLOW_SCHEMA_INVALID"); }
  }
  if (expectation.min !== undefined && typeof expectation.min !== "number") throw workflowError("min must be a number.", "WORKFLOW_SCHEMA_INVALID");
  if (expectation.max !== undefined && typeof expectation.max !== "number") throw workflowError("max must be a number.", "WORKFLOW_SCHEMA_INVALID");
}

export function substituteVariables(value, variables) {
  if (typeof value === "string" && /^\$[A-Z][A-Z0-9_]*$/.test(value)) {
    const name = value.slice(1);
    if (!Object.hasOwn(variables, name)) throw workflowError(`Missing workflow variable: ${name}`, "WORKFLOW_VARIABLE_MISSING", { name });
    return structuredClone(variables[name]);
  }
  if (Array.isArray(value)) return value.map((item) => substituteVariables(item, variables));
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substituteVariables(item, variables)]));
  return value;
}

export function assertExpectation(result, expectation, context = {}) {
  let actual = result;
  if (expectation.path) for (const part of expectation.path.split(".")) actual = actual?.[part];
  const failures = [];
  if (Object.hasOwn(expectation, "equals") && !deepEqual(actual, expectation.equals)) failures.push("equals");
  if (Object.hasOwn(expectation, "includes")) {
    const included = typeof actual === "string" ? actual.includes(String(expectation.includes)) : Array.isArray(actual) && actual.some((item) => deepEqual(item, expectation.includes));
    if (!included) failures.push("includes");
  }
  if (Object.hasOwn(expectation, "matches")) {
    let matched = false;
    try { matched = new RegExp(expectation.matches).test(String(actual)); } catch { /* reported as failed */ }
    if (!matched) failures.push("matches");
  }
  if (Object.hasOwn(expectation, "min") && !(typeof actual === "number" && actual >= expectation.min)) failures.push("min");
  if (Object.hasOwn(expectation, "max") && !(typeof actual === "number" && actual <= expectation.max)) failures.push("max");
  if (failures.length) throw workflowError(`Workflow expectation failed: ${failures.join(", ")}`, "WORKFLOW_EXPECTATION_FAILED", { ...context, path: expectation.path, actual, expected: expectation });
  return actual;
}

export async function runWorkflow(document, options, dependencies = {}) {
  validateWorkflowFile(document);
  const workflow = document.workflows.find(({ id }) => id === options.workflowId);
  if (!workflow) throw workflowError(`Unknown workflow: ${options.workflowId}`, "WORKFLOW_NOT_FOUND", { workflowId: options.workflowId });
  const variables = { ...(workflow.defaults ?? {}), ...(options.variables ?? {}), TAB_ID: options.tabId };
  const env = { ...(dependencies.env ?? process.env) };
  env.UNIVERSAL_BROWSER_SESSION_ID ||= `workflow-${crypto.randomUUID()}`;
  const invoke = dependencies.runInvocation ?? runInvocation;
  const steps = [];
  for (const step of workflow.steps) {
    const params = substituteVariables(step.params, variables);
    const result = await invoke({ mode: "call", method: step.method, params, ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }) }, { ...dependencies, env });
    if (step.expect) assertExpectation(result, substituteVariables(step.expect, variables), { workflowId: workflow.id, stepId: step.id });
    steps.push({ id: step.id, method: step.method, result });
  }
  return { workflowId: workflow.id, sessionId: env.UNIVERSAL_BROWSER_SESSION_ID, steps };
}

export async function executeWorkflowCommand(command, dependencies = {}) {
  const document = validateWorkflowFile(await loadWorkflowFile(command.file));
  if (command.mode === "list") return document.workflows.map(({ id, description, steps }) => ({ id, ...(description ? { description } : {}), stepCount: steps.length }));
  if (command.mode === "validate") return { valid: true, schemaVersion: document.schemaVersion, workflowCount: document.workflows.length, workflowIds: document.workflows.map(({ id }) => id) };
  return runWorkflow(document, command, dependencies);
}

function deepEqual(left, right) { return isDeepStrictEqual(left, right); }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function workflowError(message, code, details) {
  const error = Object.assign(new Error(message), { error: message, code });
  if (details !== undefined) error.details = details;
  return error;
}
function serializeError(error) { return { error: error.message, code: error.code, ...(error.details === undefined ? {} : { details: error.details }) }; }

async function main() {
  try { process.stdout.write(`${JSON.stringify(await executeWorkflowCommand(parseWorkflowArgs(process.argv.slice(2))))}\n`); }
  catch (error) { process.stderr.write(`${JSON.stringify(serializeError(normalizeError(error)))}\n`); process.exitCode = 1; }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
