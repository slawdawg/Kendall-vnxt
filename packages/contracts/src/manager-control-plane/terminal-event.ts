import type { EvidenceRefId } from "./ids";

/** Canonical terminal event identity produced by the manager and owned by the supervisor. */
declare const managerTerminalEventIdBrand: unique symbol;

export type ManagerTerminalEventId = `manager-terminal-event:${string}` & {
  readonly [managerTerminalEventIdBrand]: true;
};

export const MANAGER_TERMINAL_EVENT_TYPE = "authoritative_backlog_exhausted" as const;
export type ManagerTerminalEventType = typeof MANAGER_TERMINAL_EVENT_TYPE;
export const SUPERVISOR_TERMINAL_INTEGRATION_MISSING = "missing_supervisor_contract" as const;
export const SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED = "supervisor_canonical_event" as const;
export type ManagerSupervisorTerminalIntegration =
  | typeof SUPERVISOR_TERMINAL_INTEGRATION_MISSING
  | typeof SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED;

/** Serialized API keys are intentionally camelCase to match the supervisor boundary. */
export const MANAGER_TERMINAL_EVENT_REQUEST_FIELDS = [
  "eventId",
  "eventType",
  "runId",
  "sourceIdentity",
  "sourceRevision",
  "reconciliationCounts",
  "unresolvedApprovalGatedWork",
  "evidenceRefs",
  "resumeRequirement",
  "nextManagerAction",
  "idempotencyKey",
  "metadataOnly",
  "rawPayloadRetained",
] as const;

export const MANAGER_TERMINAL_EVENT_VIEW_FIELDS = [
  "eventId",
  "eventType",
  "runId",
  "sourceIdentity",
  "sourceRevision",
  "reconciliationCounts",
  "unresolvedApprovalGatedWork",
  "evidenceRefs",
  "resumeRequirement",
  "nextManagerAction",
  "idempotencyKey",
  "metadataOnly",
  "rawPayloadRetained",
  "createdAt",
] as const;

/** Serialized supervisor API envelope fields for the canonical terminal-event view. */
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_FIELDS = [
  "data",
  "meta",
] as const;
export const MANAGER_TERMINAL_EVENT_API_ENVELOPE_REQUIRED_FIELDS = [
  "data",
] as const;

export interface ManagerAuthoritativeBacklogReconciliationCounts {
  totalItems: number;
  reconciledItems: number;
  eligible: number;
  queued: number;
  leased: number;
  running: number;
  reviewFix: number;
  requiredRetrospective: number;
  otherwiseRequired: number;
  completed: number;
  closed: number;
  approvalGated: number;
}

export interface ManagerUnresolvedApprovalGatedWork {
  workId: string;
  title: string;
  reason: string;
  sourceRefs: readonly string[];
  evidenceRefs: readonly EvidenceRefId[];
}

export interface ManagerSupervisorCanonicalEventMetadata<
  TEventId extends ManagerTerminalEventId = ManagerTerminalEventId,
> {
  eventId: TEventId;
  evidenceRef: `supervisor-event:${TEventId}` & EvidenceRefId;
  status: "persisted";
  persistedAt: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Exact metadata-only request accepted by POST /manager-control-plane/terminal-events. */
export interface ManagerTerminalEventRequest {
  eventId: ManagerTerminalEventId;
  eventType: ManagerTerminalEventType;
  runId: string;
  sourceIdentity: string;
  sourceRevision: string;
  reconciliationCounts: ManagerAuthoritativeBacklogReconciliationCounts;
  unresolvedApprovalGatedWork: readonly ManagerUnresolvedApprovalGatedWork[];
  evidenceRefs: readonly EvidenceRefId[];
  resumeRequirement: string;
  nextManagerAction: string;
  idempotencyKey: string;
  metadataOnly: true;
  rawPayloadRetained: false;
}

/** Supervisor response adds only its canonical persistence timestamp. */
export interface ManagerTerminalEventView extends ManagerTerminalEventRequest {
  createdAt: string;
}

export interface ManagerTerminalEventApiEnvelope {
  data: ManagerTerminalEventView;
  meta?: Readonly<Record<string, unknown>> | null;
}
