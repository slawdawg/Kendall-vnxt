import { MANAGER_TERMINAL_EVENT_TYPE } from "./terminal-event";

export const CANDIDATE_WORK_PACKET_STATUSES = ["eligible", "needs_review", "blocked"] as const;
export type ManagerCandidateWorkPacketStatus = (typeof CANDIDATE_WORK_PACKET_STATUSES)[number];

export const WORK_ITEM_STATUSES = [
  "eligible",
  "queued",
  "leased",
  "running",
  "refilling",
  "completed",
  "failed",
  "expired",
  "quarantined",
  "blocked",
  "closed"
] as const;
export type ManagerWorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

export const LEASE_STATUSES = ["leased", "running", "completed", "failed", "expired", "blocked"] as const;
export type ManagerLeaseStatus = (typeof LEASE_STATUSES)[number];

export const EXECUTION_ATTEMPT_STATUSES = ["planned", "running", "completed", "failed", "blocked", "expired"] as const;
export type ManagerExecutionAttemptStatus = (typeof EXECUTION_ATTEMPT_STATUSES)[number];

export const REFILL_JOB_STATUSES = ["planned", "running", "completed", "blocked", "failed"] as const;
export type ManagerRefillJobStatus = (typeof REFILL_JOB_STATUSES)[number];

export const MANAGER_SUMMARY_PHASES = [
  "queued",
  "leased",
  "running",
  "refilling",
  "completed",
  "failed",
  "expired",
  "blocked",
  "needs_review",
  "closed",
  "manager_only",
  "unknown",
  "no_safe_work",
  MANAGER_TERMINAL_EVENT_TYPE,
  "unverified",
  "simulated"
] as const;
export type ManagerSummaryPhase = (typeof MANAGER_SUMMARY_PHASES)[number];

export const MANAGER_FRESHNESS_STATES = ["fresh", "stale", "unknown"] as const;
export type ManagerFreshnessState = (typeof MANAGER_FRESHNESS_STATES)[number];

export const EVIDENCE_FRESHNESS_STATES = ["fresh", "stale", "missing", "unknown"] as const;
export type EvidenceFreshnessState = (typeof EVIDENCE_FRESHNESS_STATES)[number];
