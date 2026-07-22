import type { EvidenceRefId, ExecutionJobId, ReservationLeaseId } from "./ids";

export const PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION = "parallel-execution-graph-reservation/v1" as const;
export const PARALLEL_WORK_GRAPH_EVIDENCE_SCHEMA_VERSION = "parallel-work-graph-evidence/v0" as const;

export type ParallelSuitabilityLifecycleStatus = "selected" | "deferred" | "blocked";
export type ReservationLeaseProjectionStatus = "advisory_reserved" | "deferred" | "blocked" | "not_recommended";

/** A source-declared edit surface, never an inferred filename grouping. */
export interface ChangeSurface {
  proofStatus: "source_declared_non_overlap" | "missing";
  paths: readonly string[];
}

/** Read-only reservation metadata; it is not a persisted workspace lease. */
export interface ReservationLease {
  schemaVersion: "reservation-lease-projection/v1";
  reservationLeaseId: ReservationLeaseId;
  status: ReservationLeaseProjectionStatus;
  reasonCode: string;
  reason: string;
  owner: string | null;
  worktreePath: string | null;
  evidenceRefs: readonly EvidenceRefId[];
  conflictingExecutionJobIds?: readonly ExecutionJobId[];
  expiresAt: null;
  mutation: "none; advisory projection only";
}

/** Immutable metadata-only input for a report-only read-only review candidate. */
export interface ImmutableReviewInput {
  exactHead: string;
  digest: string;
  sourceRefs: readonly string[];
  mutableWorktree: false;
  metadataOnly: true;
}

export interface ExecutionJob {
  schemaVersion: typeof PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION;
  executionJobId: ExecutionJobId;
  candidateId: string;
  purpose: string | null;
  owner: { value: string | null; status: "current_owner" | "foreign_owner" | "absent" };
  worktree: { path: string | null; status: "reported" | "absent"; reason?: string };
  readWriteMode: "read_write" | "read_only" | "unknown";
  changeSurface: ChangeSurface;
  immutableReview: ImmutableReviewInput | null;
  baselineScope: { reference: string | null; status: "reported" | "missing"; sourceRefs: readonly string[] };
  dependencies: readonly string[];
  evidenceRefs: readonly EvidenceRefId[];
  verificationTargets: readonly string[];
  lifecycleStatus: ParallelSuitabilityLifecycleStatus;
  reservationLease: ReservationLease;
  recoveryState: string;
  nextSafeAction: string;
}

/** Compact, normalized capacity policy for an advisory wave; never host telemetry or provider authority. */
export interface ParallelCapacityDecision {
  schemaVersion: "parallel-capacity-decision/v1";
  posture: "normal" | "degraded" | "blocked";
  writerCap: number;
  readOnlyCap: number;
  totalCap: number;
  externalRouteAllowance: 0;
  reasonCode: string;
  reason: string;
  nextSafeAction: string;
}

export interface ParallelSuitabilityReport {
  schemaVersion: typeof PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION;
  generatedAt: string;
  recommendation: {
    status: "advisory_only";
    maxSelected: number;
    capacity: ParallelCapacityDecision;
    selectedExecutionJobIds: readonly ExecutionJobId[];
    deferredExecutionJobIds: readonly ExecutionJobId[];
    blockedExecutionJobIds: readonly ExecutionJobId[];
    nextSafeAction: string;
  };
  executionJobs: readonly ExecutionJob[];
  reservationLeases: readonly ReservationLease[];
  mutation: "none; report-only graph and reservation recommendation";
  rawPayloadRetained: false;
  retention: "metadata_only_evidence_references";
  stopLines: readonly string[];
}

/**
 * The redacted, supervisor-consumable Packet Detail projection of one
 * ParallelSuitabilityReport execution job. It deliberately omits ChangeSurface
 * paths, worktree state, immutable-review inputs, source references, and the
 * report's raw recommendation payload.
 */
export interface ParallelWorkGraphEvidence {
  schemaVersion: typeof PARALLEL_WORK_GRAPH_EVIDENCE_SCHEMA_VERSION;
  sourceSchemaVersion: typeof PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION;
  availability: "available" | "stale" | "unavailable";
  packetId: string;
  executionJobId: ExecutionJobId | null;
  reportIdentity: string | null;
  generatedAt: string | null;
  freshnessState: "live" | "stale" | "unavailable";
  waveMembership: "selected" | "deferred" | "blocked" | "unavailable";
  dependencyState: "clear" | "declared" | "blocked" | "unavailable";
  reservation: {
    status: ReservationLeaseProjectionStatus | "unavailable";
    owner: string | null;
    reasonCode: string;
  };
  capacity: {
    posture: ParallelCapacityDecision["posture"] | "unavailable";
    reasonCode: string;
  };
  reason: string;
  nextSafeAction: string;
  evidenceRefs: readonly EvidenceRefId[];
  metadataOnly: true;
  rawPayloadRetained: false;
  retention: "metadata_only_evidence_references";
}
