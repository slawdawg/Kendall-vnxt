import type { EvidenceRefId, ExecutionJobId, ReservationLeaseId } from "./ids";

export const PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION = "parallel-execution-graph-reservation/v1" as const;

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

export interface ParallelSuitabilityReport {
  schemaVersion: typeof PARALLEL_EXECUTION_GRAPH_RESERVATION_SCHEMA_VERSION;
  generatedAt: string;
  recommendation: {
    status: "advisory_only";
    maxSelected: number;
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
