import { MANAGER_TERMINAL_EVENT_TYPE } from "./terminal-event";
import type { ManagerAuthorityDecisionClass } from "./authority";
import type { EvidenceRefId, ManagerSourceRefId, RefillJobId } from "./ids";
import type { ManagerRefillJobStatus } from "./lifecycle";
import type {
  ManagerAuthoritativeBacklogReconciliationCounts,
  ManagerSupervisorCanonicalEventMetadata,
  ManagerSupervisorTerminalIntegration,
  ManagerTerminalEventId,
  ManagerUnresolvedApprovalGatedWork,
} from "./terminal-event";

export type {
  ManagerAuthoritativeBacklogReconciliationCounts,
  ManagerSupervisorCanonicalEventMetadata,
  ManagerTerminalEventId,
  ManagerUnresolvedApprovalGatedWork,
  ManagerSupervisorTerminalIntegration,
} from "./terminal-event";

export type RefillTriggerReason = "low_watermark" | "manual_bootstrap" | "source_exhaustion_check" | "recovery";
export type RefillResult = "queued_work" | "queued_with_gated_candidates" | "no_safe_work" | typeof MANAGER_TERMINAL_EVENT_TYPE | "needs_review" | "blocked" | "failed";

export interface AuthoritativeBacklogExhaustedDisposition {
  disposition: typeof MANAGER_TERMINAL_EVENT_TYPE;
  runId: string;
  sourceIdentity: string;
  sourceRevision: string;
  reconciliationCounts: ManagerAuthoritativeBacklogReconciliationCounts;
  unresolvedApprovalGatedWork: readonly ManagerUnresolvedApprovalGatedWork[];
  evidenceRefs: readonly EvidenceRefId[];
  resumeRequirement: string;
  nextManagerAction: string;
  canonicalEventIntegration: ManagerSupervisorTerminalIntegration;
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
  result: Exclude<RefillResult, typeof MANAGER_TERMINAL_EVENT_TYPE>;
  terminalDisposition?: null;
}

export interface AuthoritativeBacklogExhaustedRefillJob extends RefillJobFields {
  result: typeof MANAGER_TERMINAL_EVENT_TYPE;
  sourceIdentity: string;
  sourceRevision: string;
  terminalDisposition: AuthoritativeBacklogExhaustedDisposition;
}

export type RefillJob = NonTerminalRefillJob | AuthoritativeBacklogExhaustedRefillJob;
