import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIT_JSON_RETAINED_ENTRY_FIELDS,
  AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS,
  auditExportJson,
  auditJsonValidationMessages,
} from "../apps/dashboard/src/lib/runner-handoff-audit-json.mjs";

function validAuditEntry(overrides = {}) {
  return {
    sequence: 1,
    lane: "dispatcher-queue-handoff-audit-json-validation-fixtures-refresh",
    branch: null,
    taskId: "task-fixture-001",
    workspaceAction: "resume-prepared-handoff",
    nextCommand: null,
    generatedAt: "2026-06-23T00:00:00.000Z",
    readinessStatus: "passed",
    readinessCommand: null,
    readinessSummary: "Synthetic readiness metadata for validation fixture coverage.",
    queueCountsStatus: "available",
    queueCounts: {
      assignable: 1,
      active: 0,
      closed: 21,
    },
    stopLines: ["no automatic takeover"],
    lifecycleState: "prepared",
    recoveryAction: "inspect-handoff-evidence",
    recoverySummary: "Synthetic recovery metadata for a prepared handoff.",
    evidenceStatus: "complete",
    evidenceSummary: "Metadata-only fixture evidence; raw provider payloads are not retained.",
    retentionPolicy: "metadata-only",
    payloadRetention: "not-retained",
    retentionSummary: "Retains handoff metadata only; raw prompts, completions, reasoning traces, secrets, and source copies are excluded.",
    ...overrides,
  };
}

function validExportPayload() {
  return JSON.parse(
    auditExportJson([validAuditEntry()], 1, {
      query: "doctor",
      evidence: "complete",
      payload: "not-retained",
    }),
  );
}

function messagesForMutatedPayload(mutator) {
  const payload = validExportPayload();
  mutator(payload);
  return auditJsonValidationMessages(JSON.stringify(payload, null, 2));
}

test("filtered handoff audit JSON export retains exactly the metadata schema fields", () => {
  const payload = validExportPayload();

  assert.deepEqual(auditJsonValidationMessages(JSON.stringify(payload, null, 2)), []);
  assert.deepEqual(payload.schema.requiredTopLevelFields, AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS);
  assert.deepEqual(payload.schema.retainedEntryFields, AUDIT_JSON_RETAINED_ENTRY_FIELDS);
  assert.deepEqual(Object.keys(payload.auditTrail[0]), AUDIT_JSON_RETAINED_ENTRY_FIELDS);
  assert.equal(payload.auditTrail[0].branch, null);
  assert.equal(payload.auditTrail[0].nextCommand, null);
  assert.equal(payload.auditTrail[0].readinessCommand, null);
  assert.equal(Object.hasOwn(payload.auditTrail[0], "providerPayload"), false);
  assert.equal(Object.hasOwn(payload.auditTrail[0], "rawPrompt"), false);
  assert.equal(Object.hasOwn(payload.auditTrail[0], "completion"), false);
  assert.equal(Object.hasOwn(payload.auditTrail[0], "reasoningTrace"), false);
});

test("filtered handoff audit JSON validation rejects malformed JSON", () => {
  assert.deepEqual(auditJsonValidationMessages("{not json"), ["invalid JSON"]);
});

test("filtered handoff audit JSON validation rejects missing schema fields", () => {
  const messages = messagesForMutatedPayload((payload) => {
    delete payload.schema;
  });

  assert(messages.includes("missing top-level fields: schema"));
  assert(messages.includes("schema must be an object"));
});

test("filtered handoff audit JSON validation rejects missing schema metadata fields", () => {
  const messages = messagesForMutatedPayload((payload) => {
    delete payload.schema.requiredTopLevelFields;
    delete payload.schema.retainedEntryFields;
  });

  assert(messages.includes("schema.requiredTopLevelFields must match exactly"));
  assert(messages.includes("schema.retainedEntryFields must match exactly"));
});

test("filtered handoff audit JSON validation rejects unexpected top-level fields", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.providerPayload = "synthetic forbidden retained field";
  });

  assert(messages.includes("unexpected top-level fields: providerPayload"));
});

test("filtered handoff audit JSON validation rejects unexpected audit entry fields", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.auditTrail[0].rawPrompt = "synthetic forbidden retained field";
  });

  assert(messages.includes("auditTrail[0] has unexpected fields: rawPrompt"));
});

test("filtered handoff audit JSON validation rejects missing retained audit entry fields", () => {
  const messages = messagesForMutatedPayload((payload) => {
    delete payload.auditTrail[0].retentionSummary;
  });

  assert(messages.includes("auditTrail[0] missing retained fields: retentionSummary"));
});

test("filtered handoff audit JSON validation rejects schema retained field drift", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.schema.retainedEntryFields = [...AUDIT_JSON_RETAINED_ENTRY_FIELDS, "providerPayload"];
  });

  assert(messages.includes("schema.retainedEntryFields must match exactly"));
});

test("filtered handoff audit JSON validation rejects invalid retention domains", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.retention.policy = "raw-provider-payloads";
    payload.auditTrail[0].retentionPolicy = "raw-provider-payloads";
  });

  assert(messages.includes("retention.policy must be metadata-only"));
  assert(messages.includes("auditTrail[0].retentionPolicy is invalid"));
});

test("filtered handoff audit JSON validation rejects invalid payload retention domains", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.retention.payload = "retained";
    payload.auditTrail[0].payloadRetention = "retained";
  });

  assert(messages.includes("retention.payload must be not-retained"));
  assert(messages.includes("auditTrail[0].payloadRetention is invalid"));
});

test("filtered handoff audit JSON validation rejects invalid filters", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.filters.evidence = "unknown";
    payload.filters.payload = "retained";
    payload.filters.query = 42;
  });

  assert(messages.includes("filters.query must be a string or null"));
  assert(messages.includes("filters.evidence is invalid"));
  assert(messages.includes("filters.payload is invalid"));
});

test("filtered handoff audit JSON validation rejects inconsistent entry totals", () => {
  const messages = messagesForMutatedPayload((payload) => {
    payload.entries.filtered = 2;
    payload.entries.total = 0;
  });

  assert(messages.includes("entries.filtered must match auditTrail length"));
  assert(messages.includes("entries.total must be greater than or equal to entries.filtered"));
});
