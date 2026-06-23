export const AUDIT_JSON_SCHEMA_ID = "kendall.runner-handoff-audit.filtered-export.v1";
export const AUDIT_JSON_SCHEMA_VERSION = 1;
export const AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS = ["schemaId", "schemaVersion", "exportKind", "retention", "schema", "entries", "filters", "auditTrail"];
export const AUDIT_JSON_RETAINED_ENTRY_FIELDS = [
  "sequence",
  "lane",
  "branch",
  "taskId",
  "workspaceAction",
  "nextCommand",
  "generatedAt",
  "readinessStatus",
  "readinessCommand",
  "readinessSummary",
  "queueCountsStatus",
  "queueCounts",
  "stopLines",
  "lifecycleState",
  "recoveryAction",
  "recoverySummary",
  "evidenceStatus",
  "evidenceSummary",
  "retentionPolicy",
  "payloadRetention",
  "retentionSummary",
];

const AUDIT_EVIDENCE_FILTER_VALUES = ["all", "complete", "partial", "invalid"];
const AUDIT_PAYLOAD_FILTER_VALUES = ["all", "not-retained", "redacted", "omitted"];
const AUDIT_RETENTION_POLICY_VALUES = ["metadata-only", "capped-metadata-only"];
const AUDIT_PAYLOAD_RETENTION_VALUES = ["not-retained", "redacted", "omitted"];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function missingObjectFields(value, fields) {
  return fields.filter((field) => !Object.hasOwn(value, field));
}

function unexpectedObjectFields(value, fields) {
  return Object.keys(value).filter((field) => !fields.includes(field));
}

function exactStringArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length && expected.every((field, index) => value[index] === field);
}

export function auditExportJson(entries, totalEntries, filters) {
  const query = filters.query.trim();
  return JSON.stringify(
    {
      schemaId: AUDIT_JSON_SCHEMA_ID,
      schemaVersion: AUDIT_JSON_SCHEMA_VERSION,
      exportKind: "filtered-handoff-audit",
      retention: {
        policy: "metadata-only",
        payload: "not-retained",
        excluded: ["raw prompts", "completions", "provider payloads", "reasoning traces", "secrets", "source copies"],
      },
      schema: {
        retainedEntryFields: AUDIT_JSON_RETAINED_ENTRY_FIELDS,
        requiredTopLevelFields: AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS,
        metadataContract: "generated-worker-handoff-audit-metadata-only",
      },
      entries: {
        filtered: entries.length,
        total: totalEntries,
      },
      filters: {
        query: query || null,
        evidence: filters.evidence,
        payload: filters.payload,
      },
      auditTrail: entries.map((entry) => ({
        sequence: entry.sequence,
        lane: entry.lane ?? null,
        branch: entry.branch ?? null,
        taskId: entry.taskId ?? null,
        workspaceAction: entry.workspaceAction ?? null,
        nextCommand: entry.nextCommand ?? null,
        generatedAt: entry.generatedAt ?? null,
        readinessStatus: entry.readinessStatus ?? null,
        readinessCommand: entry.readinessCommand ?? null,
        readinessSummary: entry.readinessSummary ?? null,
        queueCountsStatus: entry.queueCountsStatus,
        queueCounts: entry.queueCounts ?? {},
        stopLines: entry.stopLines ?? [],
        lifecycleState: entry.lifecycleState,
        recoveryAction: entry.recoveryAction,
        recoverySummary: entry.recoverySummary,
        evidenceStatus: entry.evidenceStatus,
        evidenceSummary: entry.evidenceSummary,
        retentionPolicy: entry.retentionPolicy,
        payloadRetention: entry.payloadRetention,
        retentionSummary: entry.retentionSummary,
      })),
    },
    null,
    2,
  );
}

export function auditJsonValidationMessages(jsonText) {
  const failures = [];
  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch {
    return ["invalid JSON"];
  }

  if (!isRecord(payload)) return ["JSON payload must be an object"];
  const missingTopLevelFields = missingObjectFields(payload, AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS);
  if (missingTopLevelFields.length > 0) failures.push(`missing top-level fields: ${missingTopLevelFields.join(", ")}`);
  const unexpectedTopLevelFields = unexpectedObjectFields(payload, AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS);
  if (unexpectedTopLevelFields.length > 0) failures.push(`unexpected top-level fields: ${unexpectedTopLevelFields.join(", ")}`);
  if (payload.schemaId !== AUDIT_JSON_SCHEMA_ID) failures.push("schemaId mismatch");
  if (payload.schemaVersion !== AUDIT_JSON_SCHEMA_VERSION) failures.push("schemaVersion mismatch");
  if (payload.exportKind !== "filtered-handoff-audit") failures.push("exportKind mismatch");

  const retention = payload.retention;
  if (!isRecord(retention)) {
    failures.push("retention must be an object");
  } else {
    if (retention.policy !== "metadata-only") failures.push("retention.policy must be metadata-only");
    if (retention.payload !== "not-retained") failures.push("retention.payload must be not-retained");
  }

  const schema = payload.schema;
  if (!isRecord(schema)) {
    failures.push("schema must be an object");
  } else {
    if (schema.metadataContract !== "generated-worker-handoff-audit-metadata-only") failures.push("metadata contract mismatch");
    if (!exactStringArray(schema.requiredTopLevelFields, AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS)) failures.push("schema.requiredTopLevelFields must match exactly");
    if (!exactStringArray(schema.retainedEntryFields, AUDIT_JSON_RETAINED_ENTRY_FIELDS)) failures.push("schema.retainedEntryFields must match exactly");
  }

  const auditTrail = payload.auditTrail;
  if (!Array.isArray(auditTrail)) {
    failures.push("auditTrail must be an array");
  } else {
    auditTrail.forEach((entry, index) => {
      if (!isRecord(entry)) {
        failures.push(`auditTrail[${index}] must be an object`);
        return;
      }
      const missingEntryFields = missingObjectFields(entry, AUDIT_JSON_RETAINED_ENTRY_FIELDS);
      if (missingEntryFields.length > 0) failures.push(`auditTrail[${index}] missing retained fields: ${missingEntryFields.join(", ")}`);
      const unexpectedEntryFields = unexpectedObjectFields(entry, AUDIT_JSON_RETAINED_ENTRY_FIELDS);
      if (unexpectedEntryFields.length > 0) failures.push(`auditTrail[${index}] has unexpected fields: ${unexpectedEntryFields.join(", ")}`);
      if (typeof entry.sequence !== "number") failures.push(`auditTrail[${index}].sequence must be a number`);
      if (!isRecord(entry.queueCounts)) failures.push(`auditTrail[${index}].queueCounts must be an object`);
      if (!Array.isArray(entry.stopLines)) failures.push(`auditTrail[${index}].stopLines must be an array`);
      if (!AUDIT_RETENTION_POLICY_VALUES.includes(entry.retentionPolicy)) failures.push(`auditTrail[${index}].retentionPolicy is invalid`);
      if (!AUDIT_PAYLOAD_RETENTION_VALUES.includes(entry.payloadRetention)) failures.push(`auditTrail[${index}].payloadRetention is invalid`);
    });
  }

  const entries = payload.entries;
  if (!isRecord(entries)) {
    failures.push("entries must be an object");
  } else {
    if (Array.isArray(auditTrail) && entries.filtered !== auditTrail.length) failures.push("entries.filtered must match auditTrail length");
    if (typeof entries.total !== "number") failures.push("entries.total must be a number");
    if (typeof entries.filtered === "number" && typeof entries.total === "number" && entries.total < entries.filtered) failures.push("entries.total must be greater than or equal to entries.filtered");
  }

  const filters = payload.filters;
  if (!isRecord(filters)) {
    failures.push("filters must be an object");
  } else {
    if (filters.query !== null && typeof filters.query !== "string") failures.push("filters.query must be a string or null");
    if (!AUDIT_EVIDENCE_FILTER_VALUES.includes(filters.evidence)) failures.push("filters.evidence is invalid");
    if (!AUDIT_PAYLOAD_FILTER_VALUES.includes(filters.payload)) failures.push("filters.payload is invalid");
  }

  return failures;
}
