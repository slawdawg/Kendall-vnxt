export const WORKFLOW_STATES = [
  "queued",
  "triaged",
  "ready",
  "implementing",
  "validating",
  "reviewing",
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
