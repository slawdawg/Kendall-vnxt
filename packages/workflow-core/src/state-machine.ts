import type { WorkflowState } from "@kendall/contracts";

export const LEGAL_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  queued: ["triaged"],
  triaged: ["ready", "blocked"],
  ready: ["implementing", "blocked"],
  implementing: ["validating", "needs_rework", "blocked"],
  validating: ["reviewing", "needs_rework", "operator_owned", "blocked"],
  reviewing: ["awaiting_audit", "done", "needs_rework", "operator_owned", "blocked"],
  awaiting_audit: ["done", "needs_rework", "operator_owned", "blocked"],
  needs_rework: ["implementing", "operator_owned", "blocked"],
  operator_owned: ["queued"],
  blocked: ["triaged", "ready", "operator_owned"],
  done: []
};
