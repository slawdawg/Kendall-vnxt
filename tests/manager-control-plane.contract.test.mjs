import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS,
  MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS,
  MANAGER_TERMINAL_EVENT_REQUEST_FIELDS,
  MANAGER_TERMINAL_EVENT_RECONCILIATION_COUNT_FIELDS,
  MANAGER_TERMINAL_EVENT_UNRESOLVED_WORK_FIELDS,
  MANAGER_TERMINAL_EVENT_VIEW_FIELDS,
} from "../scripts/lib/manager-control-plane/terminal-event-contract.mjs";

const contractsRoot = new URL("../packages/contracts/src/", import.meta.url);
const managerRoot = new URL("../packages/contracts/src/manager-control-plane/", import.meta.url);

const expectedModules = [
  "index.ts",
  "ids.ts",
  "types.ts",
  "lifecycle.ts",
  "authority.ts",
  "operational-action.ts",
  "events.ts",
  "terminal-event.ts",
  "refill.ts",
  "summary.ts",
  "schema-json.ts"
];

const forbiddenSourcePatterns = [
  /\bfrom\s+["']node:/,
  /\bfrom\s+["']fs["']/,
  /\bfrom\s+["']path["']/,
  /\bfrom\s+["']child_process["']/,
  /\bworkflow-core\b/,
  /\bscripts?\//,
  /\bdashboard\b/,
  /\bfrom\s+["'][^"']*adapter/i,
  /\badapters?\//i,
  /\btmux\b/i,
  /\bGitHub\b/,
  /\bprovider\b/i,
  /\bfilesystem\b/i,
  /\bprocess execution\b/i,
  /\bBullMQ\b/,
  /\bRedis\b/,
  /\bSQLite\b/,
  /\bHatchet\b/,
  /\bJob\b/,
  /\bQueue\b/
];

function assertRequiredFields(contractName, expected, actual) {
  const missing = expected.filter((field) => !actual.includes(field));
  assert.deepEqual(missing, [], `${contractName} is missing required serialized fields`);
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function extractConstArray(source, exportName) {
  const withoutComments = stripComments(source);
  const match = withoutComments.match(new RegExp(`export const ${exportName} = \\[([\\s\\S]*?)\\] as const;`));
  assert.ok(match, `missing exported const array ${exportName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractConstObjectArray(source, exportName) {
  const withoutComments = stripComments(source);
  const marker = `export const ${exportName} = `;
  const markerIndex = withoutComments.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing exported const object array ${exportName}`);
  const arrayStart = withoutComments.indexOf("[", markerIndex);
  const arrayEnd = withoutComments.indexOf("] as const", arrayStart);
  assert.notEqual(arrayStart, -1, `missing object array start for ${exportName}`);
  assert.notEqual(arrayEnd, -1, `missing object array end for ${exportName}`);
  return Function(`"use strict"; return (${withoutComments.slice(arrayStart, arrayEnd + 1)});`)();
}

function extractRequiredFieldsByContract(source, contractName) {
  const withoutComments = stripComments(source);
  const match = withoutComments.match(new RegExp(`${contractName}: \\[([\\s\\S]*?)\\](?:,|\\n\\})`));
  assert.ok(match, `missing required fields entry for ${contractName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
}

function extractTypeScriptInterfaceFields(source, interfaceName) {
  const match = source.match(new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing TypeScript interface ${interfaceName}`);
  return [...match[1].matchAll(/^\s+([A-Za-z][A-Za-z0-9]*):/gm)].map((entry) => entry[1]);
}

function extractTypeScriptInterfaceSerializedFields(source, interfaceName) {
  const match = source.match(new RegExp(`interface ${interfaceName} \\{([\\s\\S]*?)\\}`));
  assert.ok(match, `missing TypeScript interface ${interfaceName}`);
  return [...match[1].matchAll(/^\s+([A-Za-z][A-Za-z0-9]*)\??:/gm)].map((entry) => entry[1]);
}

function extractPythonModelFields(source, className) {
  const match = source.match(new RegExp(`class ${className}\\(BaseModel\\):([\\s\\S]*?)(?=\\n\\nclass |$)`));
  assert.ok(match, `missing Python model ${className}`);
  return [...match[1].matchAll(/^\s+([A-Za-z][A-Za-z0-9]*):/gm)].map((entry) => entry[1]);
}

test("Manager Control Plane contract namespace is exported from the package boundary", async () => {
  const indexSource = await readFile(new URL("index.ts", contractsRoot), "utf8");
  assert.match(indexSource, /export \* as ManagerControlPlane from "\.\/manager-control-plane";/);

  for (const moduleName of expectedModules) {
    assert.equal(existsSync(new URL(moduleName, managerRoot)), true, `missing manager-control-plane/${moduleName}`);
  }

  const managerIndex = await readFile(new URL("index.ts", managerRoot), "utf8");
  for (const moduleName of expectedModules.filter((name) => name !== "index.ts")) {
    assert.match(managerIndex, new RegExp(`export \\* from "\\./${basename(moduleName, ".ts")}";`));
  }
});

test("supervisor terminal-event request and view fields stay aligned with the TypeScript contract", async () => {
  const terminalEventSource = await readFile(new URL("terminal-event.ts", managerRoot), "utf8");
  const schemaJsonSource = await readFile(new URL("schema-json.ts", managerRoot), "utf8");
  const terminalEventContractSource = await readFile(new URL("../scripts/lib/manager-control-plane/terminal-event-contract.mjs", import.meta.url), "utf8");
  const lifecycleSource = await readFile(new URL("../packages/contracts/src/manager-control-plane/lifecycle.ts", import.meta.url), "utf8");
  const refillSource = await readFile(new URL("../packages/contracts/src/manager-control-plane/refill.ts", import.meta.url), "utf8");
  const terminalEventSyncSource = await readFile(new URL("../scripts/lib/manager-control-plane/manager-supervisor-terminal-event-sync.mjs", import.meta.url), "utf8");
  const summaryProjectionSource = await readFile(new URL("../scripts/lib/manager-control-plane/summary-projection.mjs", import.meta.url), "utf8");
  const managerCoreSource = await readFile(new URL("../scripts/lib/manager-control-plane/core.mjs", import.meta.url), "utf8");
  const terminalEventDogfoodSource = await readFile(new URL("../scripts/manager-terminal-event-dogfood.mjs", import.meta.url), "utf8");
  const dashboardSummarySource = await readFile(new URL("../apps/dashboard/src/lib/pipeline/manager-execution-lane-summary.ts", import.meta.url), "utf8");
  const sourceIntakeSyncSource = await readFile(new URL("../scripts/lib/manager-control-plane/manager-supervisor-source-intake.mjs", import.meta.url), "utf8");
  const supervisorSchemaSource = await readFile(new URL("../services/supervisor/src/supervisor/api/schemas.py", import.meta.url), "utf8");
  const supervisorMainSource = await readFile(new URL("../services/supervisor/src/supervisor/api/main.py", import.meta.url), "utf8");
  const requestFields = [
    "eventId", "eventType", "runId", "sourceIdentity", "sourceRevision", "reconciliationCounts",
    "unresolvedApprovalGatedWork", "evidenceRefs", "resumeRequirement", "nextManagerAction",
    "idempotencyKey", "metadataOnly", "rawPayloadRetained",
  ];
  const viewFields = [...requestFields, "owner", "createdAt"];
  const envelopeFields = ["data", "meta"];
  const envelopeRequiredFields = ["data"];
  const reconciliationCountFields = [
    "totalItems", "reconciledItems", "eligible", "queued", "leased", "running", "reviewFix",
    "requiredRetrospective", "otherwiseRequired", "completed", "closed", "approvalGated",
  ];
  const unresolvedWorkFields = [
    "workId", "title", "reason", "sourceRefs", "evidenceRefs",
  ];
  const tsReconciliationCountFields = extractTypeScriptInterfaceFields(terminalEventSource, "ManagerAuthoritativeBacklogReconciliationCounts");
  const tsUnresolvedWorkFields = extractTypeScriptInterfaceFields(terminalEventSource, "ManagerUnresolvedApprovalGatedWork");
  const tsEnvelopeFields = extractTypeScriptInterfaceSerializedFields(terminalEventSource, "ManagerTerminalEventApiEnvelope");
  const pyReconciliationCountFields = extractPythonModelFields(supervisorSchemaSource, "ManagerAuthoritativeBacklogReconciliationCounts");
  const pyUnresolvedWorkFields = extractPythonModelFields(supervisorSchemaSource, "ManagerUnresolvedApprovalGatedWork");
  const pyEnvelopeFields = extractPythonModelFields(supervisorSchemaSource, "ManagerTerminalEventApiEnvelope");
  const tsEnvelopeRequiredFields = extractConstArray(terminalEventSource, "MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS");
  const pyEnvelopeRequiredFields = [...supervisorSchemaSource.matchAll(/MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = \(([^)]*)\)/g)]
    .flatMap((match) => [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]));
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_REQUEST_FIELDS], requestFields, "JS request fields must match the shared serialized contract");
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_VIEW_FIELDS], viewFields, "JS view fields must match the shared serialized contract");
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS], envelopeFields, "JS API envelope fields must match the shared serialized contract");
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS], envelopeRequiredFields, "JS API envelope required fields must remain canonical");
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_RECONCILIATION_COUNT_FIELDS], reconciliationCountFields, "JS reconciliation-count fields must remain canonical");
  assert.deepEqual([...MANAGER_TERMINAL_EVENT_UNRESOLVED_WORK_FIELDS], unresolvedWorkFields, "JS unresolved-work fields must remain canonical");
  assert.deepEqual(tsReconciliationCountFields, reconciliationCountFields, "TypeScript reconciliation-count fields must remain aligned");
  assert.deepEqual(tsUnresolvedWorkFields, unresolvedWorkFields, "TypeScript unresolved-work fields must remain aligned");
  assert.deepEqual(tsEnvelopeFields, envelopeFields, "TypeScript terminal-event API envelope fields must remain aligned");
  assert.deepEqual(tsEnvelopeRequiredFields, envelopeRequiredFields, "TypeScript terminal-event API envelope required fields must remain aligned");
  assert.deepEqual(pyReconciliationCountFields, reconciliationCountFields, "Python reconciliation-count fields must remain aligned");
  assert.deepEqual(pyUnresolvedWorkFields, unresolvedWorkFields, "Python unresolved-work fields must remain aligned");
  assert.deepEqual(pyEnvelopeFields, envelopeFields, "Python terminal-event API envelope fields must remain aligned");
  assert.deepEqual(pyEnvelopeRequiredFields, envelopeRequiredFields, "Python terminal-event API envelope required fields must remain aligned");
  for (const field of requestFields) {
    assert.match(terminalEventSource, new RegExp(`\\b${field}:`), `TypeScript request is missing ${field}`);
    assert.match(supervisorSchemaSource, new RegExp(`^    ${field}:`, "m"), `Python request is missing ${field}`);
  }
  assert.match(terminalEventSource, /interface ManagerTerminalEventView extends ManagerTerminalEventRequest/);
  assert.match(terminalEventSource, /interface ManagerTerminalEventApiEnvelope/);
  assert.match(terminalEventSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = \[/);
  assert.match(supervisorSchemaSource, /class ManagerTerminalEventView\(ManagerTerminalEventRequest\)/);
  assert.match(supervisorSchemaSource, /^    createdAt:/m);
  assert.match(supervisorSchemaSource, /class ManagerTerminalEventApiEnvelope\(BaseModel\)/);
  assert.match(supervisorSchemaSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = \(\s*"data",\s*"meta",\s*\)/);
  assert.match(supervisorSchemaSource, /^    data: ManagerTerminalEventView$/m);
  assert.match(supervisorSchemaSource, /class ManagerTerminalEventApiEnvelope\(BaseModel\):[\s\S]*model_config = ConfigDict\(extra="forbid", strict=True\)/);
  assert.match(supervisorMainSource, /@app\.post\([\s\S]*\/manager-control-plane\/terminal-events[\s\S]*response_model=ManagerTerminalEventApiEnvelope/);
  assert.match(supervisorMainSource, /@app\.get\([\s\S]*\/manager-control-plane\/terminal-events\/\{event_id\}[\s\S]*response_model=ManagerTerminalEventApiEnvelope/);
  assert.match(terminalEventSource, /MANAGER_TERMINAL_EVENT_TYPE = "authoritative_backlog_exhausted"/);
  assert.match(terminalEventSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING = "missing_supervisor_contract"/);
  assert.match(terminalEventSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED = "supervisor_canonical_event"/);
  assert.match(terminalEventSource, /ManagerSupervisorTerminalIntegration/);
  assert.match(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_TYPE = "authoritative_backlog_exhausted"/);
  assert.match(terminalEventContractSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING = "missing_supervisor_contract"/);
  assert.match(terminalEventContractSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED = "supervisor_canonical_event"/);
  assert.match(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_REQUEST_FIELDS = Object\.freeze\(\[/);
  assert.match(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_VIEW_FIELDS = Object\.freeze\(\[/);
  assert.match(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = Object\.freeze\(\[/);
  assert.match(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = Object\.freeze\(\[/);
  assert.match(lifecycleSource, /import\s*\{\s*MANAGER_TERMINAL_EVENT_TYPE\s*\}\s*from\s*["']\.\/terminal-event["']/);
  assert.doesNotMatch(lifecycleSource.replace(/[\s"'`+]/g, ""), /authoritative_backlog_exhausted/);
  assert.match(refillSource, /import\s*\{\s*MANAGER_TERMINAL_EVENT_TYPE\s*\}\s*from\s*["']\.\/terminal-event["']/);
  assert.doesNotMatch(refillSource.replace(/[\s"'`+]/g, ""), /authoritative_backlog_exhausted/);
  assert.match(refillSource, /ManagerSupervisorTerminalIntegration/);
  assert.doesNotMatch(refillSource.replace(/[\s"'`+]/g, ""), /missing_supervisor_contract|supervisor_canonical_event/);
  assert.match(summaryProjectionSource, /import \{[^}]*MANAGER_TERMINAL_EVENT_TYPE[^}]*\} from "\.\/terminal-event-contract\.mjs";/);
  assert.match(summaryProjectionSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING/);
  assert.match(summaryProjectionSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED/);
  assert.match(managerCoreSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING/);
  assert.match(managerCoreSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED/);
  assert.match(managerCoreSource, /MANAGER_TERMINAL_EVENT_TYPE/);
  assert.doesNotMatch(managerCoreSource, /authoritative_backlog_exhausted/);
  assert.doesNotMatch(managerCoreSource, /"missing_supervisor_contract"|"supervisor_canonical_event"/);
  assert.match(terminalEventDogfoodSource, /MANAGER_TERMINAL_EVENT_TYPE/);
  assert.doesNotMatch(terminalEventDogfoodSource, /authoritative_backlog_exhausted/);
  assert.doesNotMatch(terminalEventDogfoodSource.replace(/[\s"'`+]/g, ""), /authoritative_backlog_exhausted/);
  assert.match(dashboardSummarySource, /import \{ ManagerControlPlane \} from "@kendall\/contracts";/);
  assert.match(dashboardSummarySource, /ManagerControlPlane\.MANAGER_TERMINAL_EVENT_TYPE/);
  assert.doesNotMatch(dashboardSummarySource, /authoritative_backlog_exhausted/);
  assert.doesNotMatch(summaryProjectionSource, /"authoritative_backlog_exhausted"/);
  assert.match(supervisorSchemaSource, /MANAGER_TERMINAL_EVENT_TYPE\s*=\s*"authoritative_backlog_exhausted"/);
  assert.match(supervisorSchemaSource, /eventType:\s*Literal\[MANAGER_TERMINAL_EVENT_TYPE\]/);
  assert.match(supervisorSchemaSource, /\{\s*MANAGER_TERMINAL_EVENT_TYPE\s*\}\s+cannot retain required executable work/);
  const extractSingleConstant = (source, pattern, label) => {
    const matches = [...source.matchAll(pattern)].map((match) => match[1]);
    assert.equal(matches.length, 1, `${label} must have exactly one canonical declaration`);
    return matches[0];
  };
  const jsTerminalEventType = extractSingleConstant(terminalEventContractSource, /MANAGER_TERMINAL_EVENT_TYPE\s*=\s*"([^"]+)"/g, "JS terminal-event type");
  const tsTerminalEventType = extractSingleConstant(terminalEventSource, /MANAGER_TERMINAL_EVENT_TYPE\s*=\s*"([^"]+)"/g, "TypeScript terminal-event type");
  const supervisorTerminalEventType = extractSingleConstant(supervisorSchemaSource, /MANAGER_TERMINAL_EVENT_TYPE\s*=\s*"([^"]+)"/g, "supervisor terminal-event type");
  assert.deepEqual(
    [jsTerminalEventType, tsTerminalEventType, supervisorTerminalEventType],
    ["authoritative_backlog_exhausted", "authoritative_backlog_exhausted", "authoritative_backlog_exhausted"],
    "JS, TypeScript, and supervisor terminal-event constants must remain exactly aligned",
  );
  const jsIntegrationStates = [
    extractSingleConstant(terminalEventContractSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING\s*=\s*"([^"]+)"/g, "JS missing-supervisor integration state"),
    extractSingleConstant(terminalEventContractSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED\s*=\s*"([^"]+)"/g, "JS persisted-supervisor integration state"),
  ];
  const tsIntegrationStates = [
    extractSingleConstant(terminalEventSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING\s*=\s*"([^"]+)"/g, "TypeScript missing-supervisor integration state"),
    extractSingleConstant(terminalEventSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED\s*=\s*"([^"]+)"/g, "TypeScript persisted-supervisor integration state"),
  ];
  assert.deepEqual(tsIntegrationStates, jsIntegrationStates, "JS and TypeScript supervisor integration states must remain exactly aligned");
  assert.match(supervisorSchemaSource, /model_config = ConfigDict\(extra="forbid", strict=True\)/);
  const tsFields = [...terminalEventSource.matchAll(/MANAGER_TERMINAL_EVENT_(?:REQUEST|VIEW)_FIELDS = \[((?:.|\n)*?)\] as const;/g)]
    .map((match) => [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]));
  assert.match(schemaJsonSource, /import \{[\s\S]*MANAGER_TERMINAL_EVENT_REQUEST_FIELDS,[\s\S]*MANAGER_TERMINAL_EVENT_VIEW_FIELDS,[\s\S]*\} from "\.\/terminal-event";/);
  assert.match(schemaJsonSource, /MANAGER_TERMINAL_EVENT_REQUEST_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_REQUEST_FIELDS;/);
  assert.match(schemaJsonSource, /MANAGER_TERMINAL_EVENT_VIEW_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_VIEW_FIELDS;/);
  assert.match(schemaJsonSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS;/);
  assert.match(schemaJsonSource, /MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS = MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS;/);
  assert.match(terminalEventSyncSource, /import \{[\s\S]*MANAGER_TERMINAL_EVENT_ID_PATTERN,[\s\S]*\} from "\.\/terminal-event-contract\.mjs";/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_TYPE/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_REQUEST_FIELDS/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_RECONCILIATION_COUNT_FIELDS/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_UNRESOLVED_WORK_FIELDS/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_VIEW_FIELDS/);
  assert.doesNotMatch(terminalEventSyncSource, /const REQUEST_KEYS\s*=|const PERSISTED_EVENT_KEYS\s*=|const RECONCILIATION_COUNT_KEYS\s*=|const UNRESOLVED_APPROVAL_GATED_WORK_KEYS\s*=/);
  assert.match(terminalEventSyncSource, /SUPERVISOR_TERMINAL_INTEGRATION_MISSING/);
  assert.match(terminalEventSyncSource, /SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED/);
  assert.doesNotMatch(terminalEventSyncSource, /"missing_supervisor_contract"|"supervisor_canonical_event"/);
  assert.doesNotMatch(terminalEventSyncSource, /eventType: "authoritative_backlog_exhausted"/);
  assert.match(terminalEventSyncSource, /MANAGER_TERMINAL_EVENT_ID_PATTERN\.test\(request\.eventId\)/);
  assert.doesNotMatch(terminalEventSyncSource, /\/\^manager-terminal-event:\[0-9a-f\]\{40\}\$\//);
  assert.match(terminalEventSyncSource, /import \{ normalizeSupervisorTimeoutMs \} from "\.\/supervisor-timeout\.mjs";/);
  assert.match(terminalEventSyncSource, /timeoutMs = normalizeSupervisorTimeoutMs\(context\.timeoutMs\)/);
  assert.match(terminalEventSyncSource, /AbortSignal\.timeout\(timeoutMs\)/);
  assert.match(terminalEventSyncSource, /import \{ parseLoopbackSupervisorUrl \} from "\.\/loopback-supervisor\.mjs";/);
  assert.match(sourceIntakeSyncSource, /import \{ parseLoopbackSupervisorUrl \} from "\.\/loopback-supervisor\.mjs";/);
  const schemaJsonAliases = [...schemaJsonSource.matchAll(/MANAGER_TERMINAL_EVENT_(?:REQUEST|VIEW)_SERIALIZED_FIELDS = (MANAGER_TERMINAL_EVENT_(?:REQUEST|VIEW)_FIELDS);/g)]
    .map((match) => match[1] === "MANAGER_TERMINAL_EVENT_REQUEST_FIELDS" ? requestFields : viewFields);
  const schemaJsonFields = schemaJsonAliases;
  const pyFields = [...supervisorSchemaSource.matchAll(/MANAGER_TERMINAL_EVENT_(?:REQUEST|VIEW)_FIELDS = \(([^)]*)\)/g)]
    .map((match) => [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]));
  const pyEnvelopeContractFields = [...supervisorSchemaSource.matchAll(/MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = \(([^)]*)\)/g)]
    .map((match) => [...match[1].matchAll(/"([^\"]+)"/g)].map((entry) => entry[1]));
  assert.deepEqual(tsFields, [requestFields, viewFields]);
  assert.deepEqual(schemaJsonFields, [requestFields, viewFields]);
  assert.deepEqual(pyFields, [requestFields, viewFields]);
  assert.deepEqual(pyEnvelopeContractFields, [envelopeFields]);
  assert.deepEqual(extractRequiredFieldsByContract(schemaJsonSource, "ManagerTerminalEventRequest"), requestFields);
  assert.deepEqual(extractRequiredFieldsByContract(schemaJsonSource, "ManagerTerminalEventView"), viewFields);
});

test("Manager Control Plane contracts define canonical objects and ids without runtime imports", async () => {
  const allSources = await Promise.all(
    expectedModules.map(async (moduleName) => ({
      moduleName,
      source: await readFile(new URL(moduleName, managerRoot), "utf8")
    }))
  );
  const combined = allSources.map(({ source }) => source).join("\n");
  const sourceByModule = new Map(allSources.map(({ moduleName, source }) => [moduleName, stripComments(source)]));

  for (const [moduleName, exportedNames] of Object.entries({
    "terminal-event.ts": [
      "ManagerTerminalEventId",
      "ManagerTerminalEventType",
      "ManagerTerminalEventRequest",
      "ManagerTerminalEventView",
      "ManagerTerminalEventApiEnvelope",
      "ManagerSupervisorCanonicalEventMetadata",
      "MANAGER_TERMINAL_EVENT_TYPE",
      "MANAGER_TERMINAL_EVENT_REQUEST_FIELDS",
      "MANAGER_TERMINAL_EVENT_VIEW_FIELDS",
      "MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS",
      "MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS",
    ],
    "types.ts": [
      "CandidateWorkPacket",
      "WorkItem",
      "Lease",
      "ExecutionAttempt",
      "EvidenceRef",
      "ImplementationRunContract",
      "ManagerRunStartState",
      "ManagerRunControlState",
      "ManagerRuntimeLedgerFileSet",
      "ManagerRuntimeLedgerEventRecord",
      "ManagerRuntimeLedgerReplaySummary"
    ],
    "refill.ts": ["RefillJob"],
    "summary.ts": ["ManagerExecutionLaneSummary"],
    "authority.ts": ["ManagerAuthorityStage", "ManagerAuthorityDecision", "ManagerRunPreauthorization"],
    "operational-action.ts": ["ManagerOperationalActionPolicy", "ManagerOperationalActionEvaluation"],
    "events.ts": ["ManagerControlPlaneEvent", "ManagerControlPlaneEventName"],
    "schema-json.ts": ["MANAGER_TERMINAL_EVENT_REQUEST_SERIALIZED_FIELDS", "MANAGER_TERMINAL_EVENT_VIEW_SERIALIZED_FIELDS", "MANAGER_TERMINAL_EVENT_API_ENVELOPE_SERIALIZED_FIELDS", "MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_SERIALIZED_FIELDS"]
  })) {
    const source = sourceByModule.get(moduleName);
    assert.ok(source, `missing source for ${moduleName}`);
    for (const exportedName of exportedNames) {
      assert.match(source, new RegExp(`export (type|interface|const) ${exportedName}\\b`), `missing ${exportedName} in ${moduleName}`);
    }
  }

  for (const idName of [
    "CandidateWorkPacketId",
    "WorkItemId",
    "LeaseId",
    "ExecutionAttemptId",
    "RefillJobId",
    "EvidenceRefId",
    "AuthorityDecisionId",
    "ImplementationRunContractId",
    "ManagerPreauthorizationId",
    "ManagerEventId",
    "ManagerSourceRefId",
    "ManagerPolicyId",
    "ManagerWorkerId",
    "ManagerRunId"
  ]) {
    assert.match(combined, new RegExp(`export type ${idName}\\b`), `missing ${idName}`);
  }

  for (const { moduleName, source } of allSources) {
    for (const pattern of forbiddenSourcePatterns) {
      assert.doesNotMatch(source, pattern, `forbidden dependency or vendor term in ${moduleName}: ${pattern}`);
    }
  }
});

test("Manager Control Plane runtime operational policy mirrors the TypeScript policy", async () => {
  const policySource = await readFile(new URL("operational-action.ts", managerRoot), "utf8");
  const runtimePolicy = JSON.parse(await readFile(new URL("operational-action-policy.runtime.json", managerRoot), "utf8"));
  const typedPolicy = extractConstObjectArray(policySource, "MANAGER_OPERATIONAL_ACTION_POLICIES");

  assert.deepEqual(runtimePolicy, typedPolicy);
});

test("Manager Control Plane schema metadata covers required serialized fields and status values", async () => {
  const schemaSource = await readFile(new URL("schema-json.ts", managerRoot), "utf8");
  const lifecycleSource = await readFile(new URL("lifecycle.ts", managerRoot), "utf8");
  const authoritySource = await readFile(new URL("authority.ts", managerRoot), "utf8");
  const eventsSource = await readFile(new URL("events.ts", managerRoot), "utf8");
  const refillSource = await readFile(new URL("refill.ts", managerRoot), "utf8");
  const summarySource = await readFile(new URL("summary.ts", managerRoot), "utf8");

  for (const literal of [
    "eligible",
    "needs_review",
    "queued",
    "leased",
    "running",
    "refilling",
    "completed",
    "failed",
    "expired",
    "quarantined",
    "blocked",
    "closed",
    "manager_only",
    "unknown",
    "no_safe_work",
    "unverified",
    "simulated"
  ]) {
    assert.match(lifecycleSource, new RegExp(`"${literal}"`), `missing lifecycle/status literal ${literal}`);
  }

  for (const literal of [
    "backend_proof",
    "bootstrap_refill",
    "governor_recovery",
    "live_worker",
    "delivery",
    "pipeline_adapter",
    "allowed_unattended",
    "requires_preauthorization",
    "block_and_record",
    "forbidden"
  ]) {
    assert.match(authoritySource, new RegExp(`"${literal}"`), `missing authority literal ${literal}`);
  }

  for (const eventName of [
    "dispatcher.work.queued",
    "dispatcher.lease.claimed",
    "dispatcher.lease.heartbeat",
    "dispatcher.lease.expired",
    "dispatcher.attempt.completed",
    "dispatcher.attempt.failed",
    "dispatcher.refill.started",
    "dispatcher.refill.completed",
    "dispatcher.authority.blocked",
    "dispatcher.candidate.blocked",
    "dispatcher.review.required",
    "dispatcher.summary.updated",
    "dispatcher.summary.stale",
    "dispatcher.progress.observed",
    "dispatcher.policy.blocked_action",
    "dispatcher.recovery.attempted",
    "dispatcher.work_supply.empty",
    "manager.run.started",
    "manager.run.steered",
    "manager.ledger.appended",
    "manager.question.recorded",
    "manager.checkpoint.recorded",
    "manager.resource.snapshot",
    "manager.usage.snapshot",
    "manager.blocker.recorded",
    "manager.recovery.blocked",
    "manager.replay.summarized"
  ]) {
    assert.match(eventsSource, new RegExp(`"${eventName.replaceAll(".", "\\.")}"`), `missing event name ${eventName}`);
  }

  for (const literal of [
    "queued_with_gated_candidates",
    "needsReviewCount",
    "blockedCount"
  ]) {
    assert.match(refillSource, new RegExp(literal), `missing refill contract literal/field ${literal}`);
  }

  for (const literal of [
    "metadataOnlyQueuedCandidates",
    "metadataOnlyQueuedCount",
    "needsReviewCandidates"
  ]) {
    assert.match(summarySource, new RegExp(literal), `missing summary contract field ${literal}`);
  }

  const requiredByContract = {
    CandidateWorkPacket: ["candidate_work_packet_id", "source_refs", "dedupe_key", "authority_class", "verification_targets", "created_at", "updated_at"],
    ManagerSourceRef: ["source_ref_id", "source_type", "label", "summary_only"],
    ManagerRunStartState: [
      "run_id",
      "source_ref",
      "source_selection",
      "source_selection_reason",
      "target_worker_policy",
      "authority_profile",
      "authority_stage",
      "runtime_state_path",
      "control_state",
      "created_at",
      "updated_at"
    ],
    ManagerRunControlState: [
      "run_id",
      "control_state",
      "requested_action",
      "affected_scope",
      "authority_basis",
      "next_action",
      "retention_class",
      "created_at"
    ],
    VerificationTarget: ["verification_target_id", "command_id", "command", "expected_result"],
    WorkItem: ["work_item_id", "evidence_refs", "created_at", "updated_at"],
    Lease: ["lease_id", "work_item_id", "attempt_id", "worker_id", "idempotency_key", "created_at", "updated_at"],
    ExecutionAttempt: ["attempt_id", "lease_id", "evidence_refs", "created_at", "updated_at"],
    RefillJob: ["refill_job_id", "source_refs", "low_watermark", "high_watermark", "created_at", "updated_at"],
    EvidenceRef: ["evidence_ref_id", "created_at"],
    ManagerAuthorityDecision: ["authority_decision_id", "authority_stage", "decision", "required_evidence_refs", "stop_reason", "created_at"],
    ManagerRunPreauthorization: [
      "preauthorization_id",
      "run_id",
      "authority_family",
      "operation",
      "scope",
      "command_id",
      "allowed_targets",
      "required_evidence_refs",
      "stop_lines",
      "created_at"
    ],
    ImplementationRunContract: [
      "implementation_run_contract_id",
      "run_id",
      "scope",
      "out_of_scope",
      "source_refs",
      "authority_stage",
      "allowed_execution_mode",
      "authority_families",
      "stop_lines",
      "verification_commands",
      "evidence_paths",
      "completion_criteria",
      "resume_protocol",
      "task_graph",
      "required_artifacts",
      "preauthorizations",
      "evidence_refs",
      "created_at",
      "updated_at"
    ],
    ManagerControlPlaneEvent: ["event_id", "schema_version", "event_name", "correlation_id", "idempotency_key", "redaction_boundary", "projection_behavior"],
    ManagerRuntimeLedgerFileSet: [
      "run_id",
      "root",
      "mission_path",
      "events_path",
      "workers_path",
      "dispatcher_summary_path",
      "checkpoints_path",
      "questions_path",
      "resource_snapshots_path",
      "usage_snapshots_path"
    ],
    ManagerRuntimeLedgerEventRecord: [
      "event_id",
      "schema_version",
      "event_name",
      "actor_type",
      "authority_basis",
      "source_refs",
      "result",
      "evidence_refs",
      "causation_id",
      "redaction_boundary",
      "projection_behavior",
      "created_at"
    ],
    ManagerRuntimeLedgerReplaySummary: [
      "run_id",
      "mission",
      "authority_stage",
      "control_state",
      "event_watermark",
      "outstanding_blockers",
      "open_questions",
      "latest_checkpoints",
      "latest_resource_state",
      "latest_usage_state",
      "next_safe_action",
      "recovery_blockers",
      "raw_payload_retained"
    ],
    ManagerExecutionLaneSummary: [
      "proof_mode",
      "state_source",
      "last_observed_at",
      "freshness",
      "current_phase",
      "next_action",
      "operator_attention_required",
      "safe_work_available_count",
      "unsafe_or_gated_work_count",
      "evidence_freshness",
      "event_watermark",
      "source_cursor",
      "evidence_links",
      "feedback_routes",
      "affected_delivery_gates",
      "feedback_record_policy",
      "feedback_unrelated_lane_policy",
      "feedback_retention",
      "feedback_raw_payload_retained"
    ]
  };
  for (const [contractName, expectedFields] of Object.entries(requiredByContract)) {
    assertRequiredFields(contractName, expectedFields, extractRequiredFieldsByContract(schemaSource, contractName));
  }

  assertRequiredFields(
    "ManagerControlPlaneEvent serialized metadata",
    ["causation_id", "payload_summary"],
    extractConstArray(schemaSource, "MANAGER_CONTROL_PLANE_EVENT_SERIALIZED_FIELDS")
  );
  assertRequiredFields(
    "ManagerRuntimeLedgerEvent serialized metadata",
    ["correlation_id", "causation_id", "ordering_key", "idempotency_key", "redaction_boundary", "projection_behavior"],
    extractConstArray(schemaSource, "MANAGER_RUNTIME_LEDGER_EVENT_SERIALIZED_FIELDS")
  );
  assertRequiredFields(
    "ManagerExecutionLaneSummary serialized truth fields",
    ["state_counts", "metadata_only_queued_count", "raw_state_labels", "evidence_links", "feedback_routes", "affected_delivery_gates", "feedback_retention", "feedback_raw_payload_retained"],
    extractConstArray(schemaSource, "MANAGER_EXECUTION_LANE_SUMMARY_SERIALIZED_FIELDS")
  );
  assert.equal(extractRequiredFieldsByContract(schemaSource, "WorkItem").includes("lease_id"), false);
  assert.equal(extractRequiredFieldsByContract(schemaSource, "ManagerControlPlaneEvent").includes("causation_id"), false);

  assert.throws(
    () => assertRequiredFields("NegativeCase", ["work_item_id", "missing_required_field"], ["work_item_id"]),
    /missing required serialized fields/
  );
});

test("Parallel suitability contracts keep graph and reservations metadata-only and structurally stable", async () => {
  const parallelSource = await readFile(new URL("parallel-suitability.ts", managerRoot), "utf8");
  const schemaSource = await readFile(new URL("schema-json.ts", managerRoot), "utf8");
  const idsSource = await readFile(new URL("ids.ts", managerRoot), "utf8");

  for (const exportedName of ["ChangeSurface", "ReservationLease", "ImmutableReviewInput", "ExecutionJob", "ParallelSuitabilityReport"]) {
    assert.match(parallelSource, new RegExp(`export (type|interface) ${exportedName}\\b`), `missing ${exportedName}`);
  }
  for (const literal of ["parallel-execution-graph-reservation/v1", "advisory_reserved", "deferred", "blocked", "read_only", "metadata_only_evidence_references"]) {
    assert.match(parallelSource, new RegExp(literal), `missing graph contract literal ${literal}`);
  }
  for (const idName of ["ExecutionJobId", "ReservationLeaseId"]) {
    assert.match(idsSource, new RegExp(`export type ${idName}\\b`), `missing ${idName}`);
  }
  assertRequiredFields(
    "ParallelSuitabilityReport serialized fields",
    ["schema_version", "generated_at", "recommendation", "execution_jobs", "reservation_leases", "mutation", "raw_payload_retained", "retention", "stop_lines"],
    extractConstArray(schemaSource, "PARALLEL_SUITABILITY_REPORT_SERIALIZED_FIELDS"),
  );
  assertRequiredFields(
    "ExecutionJob serialized fields",
    ["execution_job_id", "read_write_mode", "change_surface", "immutable_review", "baseline_scope", "reservation_lease", "lifecycle_status", "evidence_refs", "next_safe_action"],
    extractConstArray(schemaSource, "EXECUTION_JOB_SERIALIZED_FIELDS"),
  );
});

test("Manager Run start and control state schemas record source and steering evidence", async () => {
  const typesSource = await readFile(new URL("types.ts", managerRoot), "utf8");
  const schemaSource = await readFile(new URL("schema-json.ts", managerRoot), "utf8");

  for (const field of [
    "sourceRef",
    "sourceSelection",
    "targetWorkerPolicy",
    "authorityProfile",
    "runtimeStatePath",
    "controlState"
  ]) {
    assert.match(typesSource, new RegExp(`${field}:`), `ManagerRunStartState missing ${field}`);
  }

  for (const field of [
    "requestedAction",
    "affectedScope",
    "authorityBasis",
    "futureDispatch",
    "activeWorkPolicy",
    "operatorReport",
    "blocker",
    "needsReviewReason"
  ]) {
    assert.match(typesSource, new RegExp(`${field}\\??:`), `ManagerRunControlState missing ${field}`);
  }

  for (const literal of [
    "explicit",
    "inferred_assumption",
    "operator_paused",
    "drain",
    "needs_review",
    "metadata_only"
  ]) {
    assert.match(typesSource, new RegExp(`"${literal}"`), `missing run-state literal ${literal}`);
  }

  assert.match(schemaSource, /MANAGER_RUN_START_STATE_SERIALIZED_FIELDS/);
  assert.match(schemaSource, /MANAGER_RUN_CONTROL_STATE_SERIALIZED_FIELDS/);
  assert.match(schemaSource, /ManagerRunStartState/);
  assert.match(schemaSource, /ManagerRunControlState/);
});

test("Implementation Run Contract schema records authority scope resume and delivery boundaries", async () => {
  const typesSource = await readFile(new URL("types.ts", managerRoot), "utf8");
  const authoritySource = await readFile(new URL("authority.ts", managerRoot), "utf8");
  const schemaSource = await readFile(new URL("schema-json.ts", managerRoot), "utf8");

  for (const field of [
    "scope",
    "outOfScope",
    "authorityStage",
    "allowedExecutionMode",
    "stopLines",
    "verificationCommands",
    "evidencePaths",
    "completionCriteria",
    "resumeProtocol",
    "taskGraph",
    "requiredArtifacts",
    "deliveryPhase",
    "preauthorizations"
  ]) {
    assert.match(typesSource, new RegExp(`${field}\\??:`), `ImplementationRunContract missing ${field}`);
  }

  for (const literal of [
    "deterministic_script",
    "fixture_fake_worker",
    "local_runtime_state",
    "live_worker",
    "delivery_phase",
    "cleanup_phase"
  ]) {
    assert.match(typesSource, new RegExp(`"${literal}"`), `missing allowed execution mode ${literal}`);
  }

  for (const field of ["operation", "commandId", "commandPattern", "maximumMutationLevel", "expiresAt", "approvalRef", "rollbackOrRecoveryNote", "stopLines"]) {
    assert.match(authoritySource, new RegExp(`${field}\\??:`), `ManagerRunPreauthorization missing ${field}`);
  }

  assert.match(schemaSource, /IMPLEMENTATION_RUN_CONTRACT_SERIALIZED_FIELDS/);
  assert.match(schemaSource, /MANAGER_RUN_PREAUTHORIZATION_SERIALIZED_FIELDS/);
  assert.match(schemaSource, /ImplementationRunContract/);
  assert.match(schemaSource, /ManagerRunPreauthorization/);
});

test("Manager Control Plane contract TypeScript surface compiles", () => {
  const tscPath = "apps/dashboard/node_modules/.bin/tsc";
  assert.equal(existsSync(tscPath), true, "expected dashboard TypeScript compiler to be installed");
  const tempDir = mkdtempSync(join(tmpdir(), "manager-contract-behavior-"));
  const managerRootPath = fileURLToPath(managerRoot);
  const importRoot = relative(tempDir, managerRootPath).replace(/\\/g, "/");
  const importPrefix = importRoot.startsWith(".") ? importRoot : `./${importRoot}`;
  const contractsRootPath = fileURLToPath(contractsRoot);
  const contractsImportRoot = relative(tempDir, contractsRootPath).replace(/\\/g, "/");
  const contractsImportPrefix = contractsImportRoot.startsWith(".") ? contractsImportRoot : `./${contractsImportRoot}`;
  const behaviorPath = join(tempDir, "contract-behavior.ts");
  writeFileSync(
    behaviorPath,
    [
      `import { MANAGER_CONTROL_PLANE_EVENT_NAMES } from "${importPrefix}/events.ts";`,
      `import type { EvidenceRefId, ManagerEventId, ManagerRunId } from "${importPrefix}/ids.ts";`,
      `import { MANAGER_SUMMARY_PHASES } from "${importPrefix}/lifecycle.ts";`,
      `import type { RefillResult } from "${importPrefix}/refill.ts";`,
      `import { MANAGER_TERMINAL_EVENT_TYPE } from "${importPrefix}/terminal-event.ts";`,
      `import type { ManagerTerminalEventApiEnvelope, ManagerTerminalEventRequest, ManagerTerminalEventView } from "${importPrefix}/terminal-event.ts";`,
      `import { ManagerControlPlane } from "${contractsImportPrefix}/index.ts";`,
      `import type { ManagerExecutionLaneStateCounts, ManagerExecutionLaneSummary } from "${importPrefix}/summary.ts";`,
      "",
      `const eventNames: readonly string[] = MANAGER_CONTROL_PLANE_EVENT_NAMES;`,
      `if (!eventNames.includes("dispatcher.review.required")) throw new Error("missing event export");`,
      `const result: RefillResult = "queued_with_gated_candidates";`,
      `const terminalResult: RefillResult = MANAGER_TERMINAL_EVENT_TYPE;`,
      `if (!MANAGER_SUMMARY_PHASES.includes(MANAGER_TERMINAL_EVENT_TYPE)) throw new Error("summary phase missing terminal event type");`,
      `const nonTerminalResult: Exclude<RefillResult, typeof MANAGER_TERMINAL_EVENT_TYPE> = "queued_work";`,
      `// @ts-expect-error terminal result must remain excluded from non-terminal refill jobs`,
      `const invalidNonTerminalResult: Exclude<RefillResult, typeof MANAGER_TERMINAL_EVENT_TYPE> = MANAGER_TERMINAL_EVENT_TYPE;`,
      `const integration: ManagerControlPlane.ManagerSupervisorTerminalIntegration = ManagerControlPlane.SUPERVISOR_TERMINAL_INTEGRATION_MISSING;`,
      `if (integration !== "missing_supervisor_contract") throw new Error("missing supervisor integration export");`,
      `// @ts-expect-error unknown supervisor integration state must remain rejected`,
      `const invalidIntegration: ManagerControlPlane.ManagerSupervisorTerminalIntegration = "unknown_integration";`,
      `const terminalRequest: ManagerTerminalEventRequest = {`,
      `  eventId: "manager-terminal-event:${"a".repeat(40)}" as ManagerTerminalEventRequest["eventId"], eventType: MANAGER_TERMINAL_EVENT_TYPE,`,
      `  runId: "run-1", sourceIdentity: "source:accepted", sourceRevision: "git:abc1234",`,
      `  reconciliationCounts: { totalItems: 1, reconciledItems: 1, eligible: 0, queued: 0, leased: 0, running: 0, reviewFix: 0, requiredRetrospective: 0, otherwiseRequired: 0, completed: 1, closed: 0, approvalGated: 0 },`,
      `  unresolvedApprovalGatedWork: [], evidenceRefs: ["evidence:terminal" as EvidenceRefId], resumeRequirement: "Wait for new accepted source-owned backlog.",`,
      `  nextManagerAction: "Stop refill until new accepted source-owned backlog exists.", idempotencyKey: "authoritative-backlog-exhausted:run-1", metadataOnly: true, rawPayloadRetained: false`,
      `};`,
      `const terminalView: ManagerTerminalEventView = { ...terminalRequest, owner: "supervisor", createdAt: "2026-07-19T00:00:00.000Z" };`,
      `const terminalEnvelope: ManagerTerminalEventApiEnvelope = { data: terminalView, meta: null };`,
      `if (terminalEnvelope.data.eventId !== terminalView.eventId) throw new Error("terminal envelope view mismatch");`,
      `if (terminalView.eventType !== "authoritative_backlog_exhausted") throw new Error("terminal event type mismatch");`,
      `const stateCounts: ManagerExecutionLaneStateCounts = {`,
      `  totalWorkItems: 0, totalLeases: 0, totalAttempts: 0, eligible: 0, queued: 0, leased: 0, running: 0, refilling: 0,`,
      `  completed: 0, failed: 0, expired: 0, quarantined: 0, blocked: 0, closed: 0, metadataOnlyQueuedCandidates: 2,`,
      `  blockedCandidates: 1, needsReviewCandidates: 1, duplicateCandidates: 0, noSafeWork: 0`,
      `};`,
      `const summary: ManagerExecutionLaneSummary = {`,
      `  runId: "run-1" as ManagerRunId, proofMode: "backend_proof", stateSource: "projection", lastObservedAt: "2026-06-30T00:00:00.000Z",`,
      `  freshness: "fresh", currentPhase: "needs_review", nextAction: result, operatorAttentionRequired: true, recoveryStatus: "not_needed",`,
      `  recoveryAttemptCount: 0, safeWorkAvailableCount: 0, metadataOnlyQueuedCount: 2, unsafeOrGatedWorkCount: 2,`,
      `  evidenceFreshness: "fresh", eventWatermark: "event-1" as ManagerEventId, sourceCursor: "cursor-1", authorityStage: "backend_proof",`,
      `  authorityClass: "block_and_record", queuedWorkItemIds: [], activeWorkItemIds: [], evidenceRefs: ["evidence-1" as EvidenceRefId], evidenceLinks: [],`,
      `  stateCounts, rawStateLabels: ["refill:queued_metadata"], blockers: ["dispatcher_has_needs_review_candidates"], warnings: [],`,
      `  feedbackRoutes: [], affectedDeliveryGates: [], feedbackRecordPolicy: "metadata_only_feedback_record",`,
      `  feedbackUnrelatedLanePolicy: "continue_unrelated_safe_lanes", feedbackRetention: "metadata_only", feedbackRawPayloadRetained: false`,
      `};`,
      `if (summary.metadataOnlyQueuedCount !== summary.stateCounts.metadataOnlyQueuedCandidates) throw new Error("metadata-only queue mismatch");`,
      ""
    ].join("\n"),
    "utf8"
  );
  const result = spawnSync(
    tscPath,
    [
      "--noEmit",
      "--allowImportingTsExtensions",
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--target",
      "ES2022",
      "--strict",
      "--skipLibCheck",
      "packages/contracts/src/index.ts",
      behaviorPath
    ],
    { encoding: "utf8" }
  );
  try {
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
