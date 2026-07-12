import type { ManagerAuthorityDecisionClass } from "./authority";
import type { EvidenceRefId, ManagerSourceRefId, RefillJobId } from "./ids";
import type { ManagerRefillJobStatus } from "./lifecycle";

export type RefillTriggerReason = "low_watermark" | "manual_bootstrap" | "source_exhaustion_check" | "recovery";
export type RefillResult = "queued_work" | "queued_with_gated_candidates" | "no_safe_work" | "authoritative_backlog_exhausted" | "needs_review" | "blocked" | "failed";

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

export interface ManagerSupervisorCanonicalEventMetadata {
  eventId: string;
  evidenceRef: EvidenceRefId;
  status: "persisted";
  persistedAt: string;
}

export interface AuthoritativeBacklogExhaustedDisposition {
  disposition: "authoritative_backlog_exhausted";
  runId: string;
  sourceIdentity: string;
  sourceRevision: string;
  reconciliationCounts: ManagerAuthoritativeBacklogReconciliationCounts;
  unresolvedApprovalGatedWork: readonly ManagerUnresolvedApprovalGatedWork[];
  evidenceRefs: readonly EvidenceRefId[];
  resumeRequirement: string;
  nextManagerAction: string;
  canonicalEventIntegration: "missing_supervisor_contract" | "supervisor_canonical_event";
  supervisorEvent?: ManagerSupervisorCanonicalEventMetadata;
  idempotencyKey: string;
  rawPayloadRetained: false;
}

interface RefillJobFields {
  refillJobId: RefillJobId;
  sourceRefs: readonly ManagerSourceRefId[];
  triggerReason: RefillTriggerReason;
  lowWatermark: number;
  highWatermark: number;
  lockId: string;
  candidateCount: number;
  queuedCount: number;
  needsReviewCount: number;
  blockedCount: number;
  authorityClass: ManagerAuthorityDecisionClass;
  state: ManagerRefillJobStatus;
  startedAt: string;
  finishedAt?: string | null;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}

export interface NonTerminalRefillJob extends RefillJobFields {
  result: Exclude<RefillResult, "authoritative_backlog_exhausted">;
  terminalDisposition?: null;
}

export interface AuthoritativeBacklogExhaustedRefillJob extends RefillJobFields {
  result: "authoritative_backlog_exhausted";
  sourceIdentity: string;
  sourceRevision: string;
  terminalDisposition: AuthoritativeBacklogExhaustedDisposition;
}

export type RefillJob = NonTerminalRefillJob | AuthoritativeBacklogExhaustedRefillJob;
