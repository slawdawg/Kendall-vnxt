from supervisor.domain.types import RunMode, WorkflowState


def default_status_summary(state: WorkflowState) -> str:
    return {
        WorkflowState.QUEUED: "Waiting in the shared queue.",
        WorkflowState.TRIAGED: "Being assessed for readiness and routing.",
        WorkflowState.READY: "Ready for the next worker assignment.",
        WorkflowState.IMPLEMENTING: "Implementation is currently in progress.",
        WorkflowState.VALIDATING: "Validation is running against the latest attempt.",
        WorkflowState.REVIEWING: "The latest result is under review.",
        WorkflowState.AWAITING_AUDIT: "Audit review is required before this item can complete.",
        WorkflowState.NEEDS_REWORK: "More work is needed before the item can complete.",
        WorkflowState.BLOCKED: "This item is blocked and needs attention before it can continue.",
        WorkflowState.DONE: "This item has completed the current workflow.",
    }[state]


def next_step_summary(state: WorkflowState) -> str | None:
    return {
        WorkflowState.QUEUED: "Move into triage",
        WorkflowState.TRIAGED: "Make readiness decision",
        WorkflowState.READY: "Start implementation",
        WorkflowState.IMPLEMENTING: "Send to validation",
        WorkflowState.VALIDATING: "Accept validation or route to rework",
        WorkflowState.REVIEWING: "Approve, request audit, or send to rework",
        WorkflowState.AWAITING_AUDIT: "Complete audit review or request rework",
        WorkflowState.NEEDS_REWORK: "Restart implementation",
        WorkflowState.BLOCKED: "Return to ready",
        WorkflowState.DONE: None,
    }[state]


def mode_summary(mode: RunMode) -> str:
    return {
        RunMode.RUNNING: "Monitoring and launching eligible work.",
        RunMode.PAUSED: "New work is paused.",
        RunMode.DRAINING: "Active work may finish, but no new work will start.",
        RunMode.DISABLED: "Background monitoring is disabled.",
    }[mode]
