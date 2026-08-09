/**
 * Structural, content-free lifecycle vocabulary for the private Memory Inbox
 * persistence plane.  This module intentionally contains no source or
 * proposal content fields: later stories own their separately gated stores.
 */
export const MEMORY_INBOX_LIFECYCLE_SCHEMA_VERSION = "kendall-memory-inbox-lifecycle/v1" as const;

export const memoryInboxSourceStates = [
  "Scanning", "Quarantined", "Unprocessed", "Draft", "AwaitingAuthorization",
  "Processing", "Review", "Returned", "DeniedRetained", "DeletePending", "Deleted", "RejectedUnsafe",
] as const;
export const memoryInboxProposalStates = ["Absent", "Draft", "Ready", "Returned", "Denied", "Approved"] as const;
export const memoryInboxAttemptStates = ["Planned", "Claimed", "Dispatched", "CompletionUnknown", "Reconciled", "Cancelled", "Closed"] as const;
export const memoryInboxDeletionStates = ["None", "Pending", "Proven", "RetryNeeded"] as const;
export const memoryInboxCommandOutcomes = ["accepted", "replayed", "conflict", "rejected"] as const;

export type MemoryInboxSourceState = typeof memoryInboxSourceStates[number];
export type MemoryInboxProposalState = typeof memoryInboxProposalStates[number];
export type MemoryInboxAttemptState = typeof memoryInboxAttemptStates[number];
export type MemoryInboxDeletionState = typeof memoryInboxDeletionStates[number];
export type MemoryInboxCommandOutcome = typeof memoryInboxCommandOutcomes[number];

export interface MemoryInboxCommandFenceV1 {
  schemaVersion: typeof MEMORY_INBOX_LIFECYCLE_SCHEMA_VERSION;
  aggregateId: string;
  expectedRevision: number;
  idempotencyKey: string;
  commandKind: string;
  requestDigest: string;
}

export interface MemoryInboxRecordedCommandResultV1 {
  schemaVersion: typeof MEMORY_INBOX_LIFECYCLE_SCHEMA_VERSION;
  aggregateId: string;
  expectedRevision: number;
  idempotencyKey: string;
  outcome: MemoryInboxCommandOutcome;
  reasonCode: string;
  resultingRevision: number;
}

export interface MemoryInboxProjectionRowV1 {
  sourceId: string;
  lifecycleState: MemoryInboxSourceState;
  revision: number;
  retentionDeadlineAt: string;
  deletionState: MemoryInboxDeletionState;
  nextSafeAction: string;
}

export interface MemoryInboxProjectionV1 {
  schemaVersion: "kendall-memory-inbox-projection/v1";
  truth: "supervisor_owned";
  freshness: "current";
  rows: MemoryInboxProjectionRowV1[];
  reviewReadyCount: number;
  nextSafeAction: string;
}

export interface MemoryInboxTextCaptureResultV1 {
  schemaVersion: "kendall-memory-inbox-capture/v1";
  sourceId: string;
  lifecycleState: "Unprocessed";
  nextSafeAction: "create_draft";
}

export function isMemoryInboxProjectionV1(value: unknown): value is MemoryInboxProjectionV1 {
  if (!value || typeof value !== "object") return false;
  const projection = value as Record<string, unknown>;
  return projection.schemaVersion === "kendall-memory-inbox-projection/v1"
    && projection.truth === "supervisor_owned"
    && projection.freshness === "current"
    && Array.isArray(projection.rows)
    && typeof projection.reviewReadyCount === "number"
    && typeof projection.nextSafeAction === "string";
}

export function isMemoryInboxTextCaptureResultV1(value: unknown): value is MemoryInboxTextCaptureResultV1 {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return result.schemaVersion === "kendall-memory-inbox-capture/v1"
    && typeof result.sourceId === "string"
    && result.lifecycleState === "Unprocessed"
    && result.nextSafeAction === "create_draft";
}

export function isPositiveMemoryInboxRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function isMemoryInboxLifecycleState(value: unknown): value is MemoryInboxSourceState {
  return typeof value === "string" && (memoryInboxSourceStates as readonly string[]).includes(value);
}
