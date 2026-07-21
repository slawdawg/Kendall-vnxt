import {
  MANAGER_TERMINAL_EVENT_TYPE,
  SUPERVISOR_TERMINAL_INTEGRATION_MISSING,
  SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED,
} from "./terminal-event";
import type { ManagerAuthorityDecisionClass } from "./authority";
import type { EvidenceRefId, ManagerSourceRefId, RefillJobId } from "./ids";
import type { ManagerRefillJobStatus } from "./lifecycle";
import type {
  ManagerAuthoritativeBacklogReconciliationCounts,
  ManagerSupervisorCanonicalEventMetadata,
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

interface AuthoritativeBacklogExhaustedDispositionBase {
  disposition: typeof MANAGER_TERMINAL_EVENT_TYPE;
  runId: string;
  sourceIdentity: string;
  sourceRevision: string;
  reconciliationCounts: ManagerAuthoritativeBacklogReconciliationCounts;
  unresolvedApprovalGatedWork: readonly ManagerUnresolvedApprovalGatedWork[];
  evidenceRefs: readonly EvidenceRefId[];
  resumeRequirement: string;
  nextManagerAction: string;
  idempotencyKey: string;
  rawPayloadRetained: false;
}

/** Terminal metadata is explicitly absent until supervisor persistence succeeds. */
export interface MissingSupervisorTerminalEventDisposition
  extends AuthoritativeBacklogExhaustedDispositionBase {
  canonicalEventIntegration: typeof SUPERVISOR_TERMINAL_INTEGRATION_MISSING;
  supervisorEvent?: never;
}

/** A persisted terminal disposition must carry the supervisor-owned event metadata. */
export interface SupervisorCanonicalTerminalEventDisposition
  extends AuthoritativeBacklogExhaustedDispositionBase {
  canonicalEventIntegration: typeof SUPERVISOR_TERMINAL_INTEGRATION_PERSISTED;
  supervisorEvent: ManagerSupervisorCanonicalEventMetadata;
}

export type AuthoritativeBacklogExhaustedDisposition =
  | MissingSupervisorTerminalEventDisposition
  | SupervisorCanonicalTerminalEventDisposition;

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
