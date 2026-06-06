export const WORKFLOW_STATES = [
  "queued",
  "triaged",
  "ready",
  "implementing",
  "validating",
  "reviewing",
  "awaiting_audit",
  "needs_rework",
  "blocked",
  "done"
] as const;

export type WorkflowState = (typeof WORKFLOW_STATES)[number];

export const BMAD_LANES = [
  "intake",
  "implementation",
  "validation",
  "review",
  "corrective_loop"
] as const;

export type BmadLane = (typeof BMAD_LANES)[number];

export const RUN_MODES = [
  "running",
  "paused",
  "draining",
  "disabled"
] as const;

export type RunMode = (typeof RUN_MODES)[number];

export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const WORK_ITEM_FILTER_SCOPES = ["queue", "active-work", "audit", "attention"] as const;
export type WorkItemFilterScope = (typeof WORK_ITEM_FILTER_SCOPES)[number];

export const AUDIT_FILTER_MODES = ["all", "none", "advisory", "required"] as const;
export type AuditFilterMode = (typeof AUDIT_FILTER_MODES)[number];

export const WORKFLOW_ACTIONS = [
  "submit_for_validation",
  "validation_passed",
  "validation_failed",
  "approve_review",
  "complete_audit_review",
  "request_rework",
  "restart_implementation",
  "return_to_ready"
] as const;

export type WorkflowAction = (typeof WORKFLOW_ACTIONS)[number];
