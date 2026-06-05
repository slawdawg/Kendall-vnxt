import type { WorkflowAction, WorkflowState } from "@kendall/contracts";

export const actionsByState: Partial<Record<WorkflowState, Array<{ action: WorkflowAction; label: string }>>> = {
  implementing: [{ action: "submit_for_validation", label: "Send to validation" }],
  validating: [
    { action: "validation_passed", label: "Validation passed" },
    { action: "validation_failed", label: "Send to rework" },
  ],
  reviewing: [
    { action: "approve_review", label: "Approve work" },
    { action: "request_rework", label: "Request rework" },
  ],
  awaiting_audit: [
    { action: "complete_audit_review", label: "Complete audit review" },
    { action: "request_rework", label: "Request rework" },
  ],
  needs_rework: [{ action: "restart_implementation", label: "Restart implementation" }],
  blocked: [{ action: "return_to_ready", label: "Return to ready" }],
};

export function messageForWorkflowAction(action: WorkflowAction): string {
  return {
    submit_for_validation: "Implementation handed off to validation.",
    validation_passed: "Validation accepted the latest attempt.",
    validation_failed: "Work item routed back into rework.",
    approve_review: "Review approved. Work item is complete.",
    complete_audit_review: "Audit gate cleared. Work item is complete.",
    request_rework: "Review requested another implementation pass.",
    restart_implementation: "Corrective loop sent back to implementation.",
    return_to_ready: "Blocked item returned to the ready queue.",
  }[action];
}

export function policyHintForState(state: WorkflowState, requiresAudit: boolean): string | null {
  if (state === "reviewing" && requiresAudit) {
    return "Approving this item will open an audit gate before completion. Include a note.";
  }
  if (state === "awaiting_audit") {
    return "Audit completion requires a note before the item can finish.";
  }
  if (state === "validating" || state === "blocked" || state === "needs_rework") {
    return "Rework and unblock decisions require an operator note.";
  }
  return null;
}
