import type { WorkflowState } from "@kendall/contracts";

export const LEGAL_TRANSITIONS: Record<WorkflowState, WorkflowState[]> = {
  queued: ["triaged"],
  triaged: ["ready", "blocked"],
  ready: ["implementing", "blocked"],
  implementing: ["validating", "needs_rework", "blocked"],
  validating: ["reviewing", "needs_rework", "blocked"],
  reviewing: ["done", "needs_rework", "blocked"],
  needs_rework: ["implementing", "blocked"],
  blocked: ["triaged", "ready"],
  done: []
};
