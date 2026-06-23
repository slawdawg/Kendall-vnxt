import type { RunnerHandoffAuditEntryView } from "@kendall/contracts";

export const AUDIT_JSON_SCHEMA_ID: string;
export const AUDIT_JSON_SCHEMA_VERSION: number;
export const AUDIT_JSON_REQUIRED_TOP_LEVEL_FIELDS: readonly string[];
export const AUDIT_JSON_RETAINED_ENTRY_FIELDS: readonly string[];

export function auditExportJson(
  entries: RunnerHandoffAuditEntryView[],
  totalEntries: number,
  filters: {
    query: string;
    evidence: "all" | RunnerHandoffAuditEntryView["evidenceStatus"];
    payload: "all" | RunnerHandoffAuditEntryView["payloadRetention"];
  },
): string;

export function auditJsonValidationMessages(jsonText: string): string[];
