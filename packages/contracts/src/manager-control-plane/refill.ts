import type { ManagerAuthorityDecisionClass } from "./authority";
import type { EvidenceRefId, ManagerSourceRefId, RefillJobId } from "./ids";
import type { ManagerRefillJobStatus } from "./lifecycle";

export type RefillTriggerReason = "low_watermark" | "manual_bootstrap" | "source_exhaustion_check" | "recovery";
export type RefillResult = "queued_work" | "no_safe_work" | "needs_review" | "blocked" | "failed";

export interface RefillJob {
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
  result: RefillResult;
  evidenceRefs: readonly EvidenceRefId[];
  createdAt: string;
  updatedAt: string;
}
