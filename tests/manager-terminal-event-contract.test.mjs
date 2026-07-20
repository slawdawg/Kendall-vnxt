import assert from "node:assert/strict";
import test from "node:test";

import { buildAuthoritativeBacklogExhaustedDisposition } from "../scripts/lib/manager-control-plane/core.mjs";
import { buildManagerExecutionLaneSummary } from "../scripts/lib/manager-control-plane/summary-projection.mjs";
import {
  MANAGER_TERMINAL_EVENT_ID_PATTERN,
  MANAGER_TERMINAL_EVENT_REQUEST_FIELDS,
  MANAGER_TERMINAL_EVENT_TYPE,
  MANAGER_TERMINAL_EVENT_VIEW_FIELDS,
  SUPERVISOR_TERMINAL_INTEGRATION_MISSING,
  SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED,
  SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS,
  isCanonicalTerminalEventTimestamp,
  isValidSupervisorTerminalEventMetadata,
  normalizeSupervisorTerminalEventMetadata,
} from "../scripts/lib/manager-control-plane/terminal-event-contract.mjs";

const RUN_ID = "manager-terminal-event-contract-test";
const SOURCE_IDENTITY = "prd:_bmad-output/planning-artifacts/prds/prd-terminal-event-contract/prd.md";
const SOURCE_REVISION = `git:${"7".repeat(40)}`;
const EVENT_ID = `manager-terminal-event:${"a".repeat(40)}`;
const VALID_EVENT = Object.freeze({
  eventId: EVENT_ID,
  evidenceRef: `supervisor-event:${EVENT_ID}`,
  status: "persisted",
  persistedAt: "2026-07-12T14:28:15.078Z",
  metadataOnly: true,
  rawPayloadRetained: false,
});

const EVENT_CASES = [
  ["canonical metadata", true, (event) => event],
  ["noncanonical event ID delimiter", false, (event) => ({ ...event, eventId: `manager-terminal-event-${"a".repeat(40)}` })],
  ["uppercase event ID", false, (event) => ({ ...event, eventId: `manager-terminal-event:${"A".repeat(40)}` })],
  ["mismatched evidence reference", false, (event) => ({ ...event, evidenceRef: "supervisor-event:copied-proof" })],
  ["non-persisted status", false, (event) => ({ ...event, status: "copied" })],
  ["noncanonical ISO timestamp", false, (event) => ({ ...event, persistedAt: "2026-07-12T14:28:15Z" })],
  ["metadata-only violation", false, (event) => ({ ...event, metadataOnly: false })],
  ["raw-payload retention violation", false, (event) => ({ ...event, rawPayloadRetained: true })],
  ["extra key", false, (event) => ({ ...event, rawPayload: { forbidden: true } })],
  ["missing key", false, (event) => {
    const copy = { ...event };
    delete copy.metadataOnly;
    return copy;
  }],
];

test("shared canonical terminal-event contract keeps both consumers aligned and immutable", () => {
  assert.equal(MANAGER_TERMINAL_EVENT_TYPE, "authoritative_backlog_exhausted");
  assert.equal(SUPERVISOR_TERMINAL_INTEGRATION_MISSING, "missing_supervisor_contract");
  assert.equal(SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED, "supervisor_canonical_event");
  assert.deepEqual(MANAGER_TERMINAL_EVENT_REQUEST_FIELDS, [
    "eventId", "eventType", "runId", "sourceIdentity", "sourceRevision", "reconciliationCounts",
    "unresolvedApprovalGatedWork", "evidenceRefs", "resumeRequirement", "nextManagerAction",
    "idempotencyKey", "metadataOnly", "rawPayloadRetained",
  ]);
  assert.deepEqual(MANAGER_TERMINAL_EVENT_VIEW_FIELDS, [
    ...MANAGER_TERMINAL_EVENT_REQUEST_FIELDS, "createdAt",
  ]);
  assert.equal(Object.isFrozen(MANAGER_TERMINAL_EVENT_REQUEST_FIELDS), true);
  assert.equal(Object.isFrozen(MANAGER_TERMINAL_EVENT_VIEW_FIELDS), true);
  assert.deepEqual(SUPERVISOR_TERMINAL_EVENT_METADATA_KEYS, [
    "eventId",
    "evidenceRef",
    "status",
    "persistedAt",
    "metadataOnly",
    "rawPayloadRetained",
  ]);
  assert.equal(MANAGER_TERMINAL_EVENT_ID_PATTERN.test(EVENT_ID), true);
  assert.equal(MANAGER_TERMINAL_EVENT_ID_PATTERN.test(`manager-terminal-event:${"A".repeat(40)}`), false);
  assert.equal(isCanonicalTerminalEventTimestamp(VALID_EVENT.persistedAt), true);
  assert.equal(isCanonicalTerminalEventTimestamp("2026-07-12T14:28:15Z"), false);

  for (const [label, expectedAccepted, makeEvent] of EVENT_CASES) {
    const event = deepFreeze(makeEvent(structuredClone(VALID_EVENT)));
    const eventSnapshot = structuredClone(event);

    assert.equal(isValidSupervisorTerminalEventMetadata(event), expectedAccepted, `${label}: shared validator`);
    const normalized = normalizeSupervisorTerminalEventMetadata(event);
    assert.equal(normalized !== null, expectedAccepted, `${label}: shared normalizer`);
    if (normalized) {
      assert.deepEqual(normalized, VALID_EVENT, `${label}: canonical normalized copy`);
      assert.notStrictEqual(normalized, event, `${label}: normalizer must not return the input object`);
    }
    assert.deepEqual(event, eventSnapshot, `${label}: shared contract input immutability`);

    const coreInput = deepFreeze(buildCoreInput(event));
    const coreSnapshot = structuredClone(coreInput);
    const coreDisposition = buildAuthoritativeBacklogExhaustedDisposition(coreInput);
    const coreAccepted = coreDisposition?.canonicalEventIntegration === "supervisor_canonical_event";
    assert.equal(coreAccepted, expectedAccepted, `${label}: core consumer`);
    assert.deepEqual(coreInput, coreSnapshot, `${label}: core input immutability`);
    if (coreAccepted) {
      assert.deepEqual(coreDisposition.supervisorEvent, VALID_EVENT, `${label}: core normalized metadata`);
      assert.notStrictEqual(coreDisposition.supervisorEvent, event, `${label}: core must retain a normalized copy`);
    } else {
      assert.equal(coreDisposition?.canonicalEventIntegration, "missing_supervisor_contract", `${label}: core fails closed`);
      assert.equal(coreDisposition?.supervisorEvent, undefined, `${label}: core omits rejected metadata`);
    }

    const summaryInput = deepFreeze(buildSummaryInput(event));
    const summarySnapshot = JSON.stringify(summaryInput);
    const summary = buildManagerExecutionLaneSummary(summaryInput);
    const summaryAccepted = summary.terminalDisposition?.canonicalEventIntegration === "supervisor_canonical_event";
    assert.equal(summaryAccepted, expectedAccepted, `${label}: summary consumer`);
    assert.equal(summaryAccepted, coreAccepted, `${label}: consumer equivalence`);
    assert.equal(JSON.stringify(summaryInput), summarySnapshot, `${label}: summary input immutability`);
    if (!summaryAccepted) {
      assert.equal(summary.terminalDisposition, null, `${label}: summary fails closed`);
      assert.ok(summary.blockers.includes("terminal_refill_history_conflict"), `${label}: summary conflict evidence`);
    }
  }
});

function buildCoreInput(supervisorEvent) {
  return {
    runId: RUN_ID,
    sourceRefs: [SOURCE_IDENTITY],
    activeSource: {
      sourceIdentity: SOURCE_IDENTITY,
      sourceRevision: SOURCE_REVISION,
      sourceRefs: [SOURCE_IDENTITY],
    },
    authoritativeSourceBundle: {
      sourceIdentity: SOURCE_IDENTITY,
      sourceRevision: SOURCE_REVISION,
      fullyReconciled: true,
      noSeparatelyApprovedSource: true,
      reconciliationCounts: reconciliationCounts(),
      unresolvedApprovalGatedWork: [],
      evidenceRefs: ["evidence:terminal-event-contract"],
      resumeRequirement: "Continue only after a new accepted source-owned bundle is available.",
      nextManagerAction: "Stop without dispatch, refill, or worker launch.",
      canonicalEventIntegration: "supervisor_canonical_event",
      supervisorEvent,
      metadataOnly: true,
      rawPayloadRetained: false,
    },
  };
}

function buildSummaryInput(supervisorEvent) {
  const terminalDisposition = {
    disposition: "authoritative_backlog_exhausted",
    runId: RUN_ID,
    sourceIdentity: SOURCE_IDENTITY,
    sourceRevision: SOURCE_REVISION,
    reconciliationCounts: reconciliationCounts(),
    unresolvedApprovalGatedWork: [],
    evidenceRefs: ["evidence:terminal-event-contract"],
    resumeRequirement: "Continue only after a new accepted source-owned bundle is available.",
    nextManagerAction: "Stop without dispatch, refill, or worker launch.",
    canonicalEventIntegration: "supervisor_canonical_event",
    supervisorEvent,
    idempotencyKey: "authoritative-backlog-exhausted:terminal-event-contract",
    rawPayloadRetained: false,
  };
  return {
    runId: RUN_ID,
    clock: {
      nowEpochMs: () => Date.parse("2026-07-12T14:29:15.078Z"),
      nowIso: () => "2026-07-12T14:29:15.078Z",
    },
    refillJobs: [{
      refillJobId: "refill-terminal-event-contract",
      sourceRefs: [SOURCE_IDENTITY],
      sourceIdentity: SOURCE_IDENTITY,
      sourceRevision: SOURCE_REVISION,
      state: "completed",
      result: "authoritative_backlog_exhausted",
      terminalDisposition,
    }],
    events: [],
  };
}

function reconciliationCounts() {
  return {
    totalItems: 1,
    reconciledItems: 1,
    eligible: 0,
    queued: 0,
    leased: 0,
    running: 0,
    reviewFix: 0,
    requiredRetrospective: 0,
    otherwiseRequired: 0,
    completed: 1,
    closed: 0,
    approvalGated: 0,
  };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
