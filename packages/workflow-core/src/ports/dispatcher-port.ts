import type { ManagerControlPlane } from "@kendall/contracts";
import type { ManagerClock, ManagerLifecycleResult } from "../manager-control-plane";

export interface DispatcherRefillInput {
  candidates: readonly ManagerControlPlane.CandidateWorkPacket[];
  policyReason: string;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface DispatcherClaimInput {
  workerId: ManagerControlPlane.ManagerWorkerId;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface DispatcherHeartbeatInput {
  leaseId: ManagerControlPlane.LeaseId;
  workerId: ManagerControlPlane.ManagerWorkerId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  ttlMs: number;
}

export interface DispatcherCloseoutInput {
  leaseId: ManagerControlPlane.LeaseId;
  workerId: ManagerControlPlane.ManagerWorkerId;
  attemptId: ManagerControlPlane.ExecutionAttemptId;
  idempotencyKey: ManagerControlPlane.ManagerIdempotencyKey;
  authorityDecisionId: ManagerControlPlane.AuthorityDecisionId;
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
  resultSummary?: string | null;
  failureReason?: string | null;
}

export interface DispatcherRecoveryInput {
  evidenceRefs: readonly ManagerControlPlane.EvidenceRefId[];
}

export interface DispatcherRefillResult {
  refillJob: ManagerControlPlane.RefillJob;
  queuedWorkItems: readonly ManagerControlPlane.WorkItem[];
  duplicateCandidates: readonly ManagerControlPlane.CandidateWorkPacket[];
  blockedCandidates: readonly ManagerControlPlane.CandidateWorkPacket[];
  events: readonly ManagerControlPlane.ManagerControlPlaneEvent[];
}

export interface DispatcherClaimResult {
  workItem: ManagerControlPlane.WorkItem;
  lease: ManagerControlPlane.Lease;
  executionAttempt: ManagerControlPlane.ExecutionAttempt;
  events: readonly ManagerControlPlane.ManagerControlPlaneEvent[];
}

export interface DispatcherHeartbeatResult {
  workItem: ManagerControlPlane.WorkItem;
  lease: ManagerControlPlane.Lease;
  events: readonly ManagerControlPlane.ManagerControlPlaneEvent[];
}

export interface DispatcherCloseoutResult {
  workItem: ManagerControlPlane.WorkItem;
  lease: ManagerControlPlane.Lease;
  executionAttempt: ManagerControlPlane.ExecutionAttempt;
  evidenceRecords: readonly ManagerControlPlane.EvidenceRef[];
  events: readonly ManagerControlPlane.ManagerControlPlaneEvent[];
}

export interface DispatcherRecoveryResult {
  recoveredWorkItems: readonly ManagerControlPlane.WorkItem[];
  expiredLeases: readonly ManagerControlPlane.Lease[];
  events: readonly ManagerControlPlane.ManagerControlPlaneEvent[];
}

export interface DispatcherPort {
  readonly mode: "backend_proof";
  readonly clock: ManagerClock;
  refill(input: DispatcherRefillInput): Promise<ManagerLifecycleResult<DispatcherRefillResult>>;
  claim(input: DispatcherClaimInput): Promise<ManagerLifecycleResult<DispatcherClaimResult>>;
  heartbeat(input: DispatcherHeartbeatInput): Promise<ManagerLifecycleResult<DispatcherHeartbeatResult>>;
  complete(input: DispatcherCloseoutInput): Promise<ManagerLifecycleResult<DispatcherCloseoutResult>>;
  fail(input: DispatcherCloseoutInput): Promise<ManagerLifecycleResult<DispatcherCloseoutResult>>;
  recoverExpiredLeases(input: DispatcherRecoveryInput): Promise<ManagerLifecycleResult<DispatcherRecoveryResult>>;
  summarize(): Promise<ManagerControlPlane.ManagerExecutionLaneSummary>;
}
