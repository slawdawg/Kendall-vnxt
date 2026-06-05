from supervisor.domain.types import RunMode, WorkflowState


def default_status_summary(state: WorkflowState) -> str:
    return {
        WorkflowState.QUEUED: "Waiting in the shared queue.",
        WorkflowState.TRIAGED: "Being assessed for readiness and routing.",
        WorkflowState.READY: "Ready for the next worker assignment.",
        WorkflowState.IMPLEMENTING: "Implementation is currently in progress.",
        WorkflowState.VALIDATING: "Validation is running against the latest attempt.",
        WorkflowState.REVIEWING: "The latest result is under review.",
        WorkflowState.NEEDS_REWORK: "More work is needed before the item can complete.",
        WorkflowState.BLOCKED: "This item is blocked and needs attention before it can continue.",
        WorkflowState.DONE: "This item has completed the current workflow.",
    }[state]


def next_step_summary(state: WorkflowState) -> str | None:
    return {
        WorkflowState.QUEUED: "Triage",
        WorkflowState.TRIAGED: "Readiness decision",
        WorkflowState.READY: "Worker dispatch",
        WorkflowState.IMPLEMENTING: "Validation",
        WorkflowState.VALIDATING: "Review",
        WorkflowState.REVIEWING: "Completion or rework",
        WorkflowState.NEEDS_REWORK: "Implementation retry",
        WorkflowState.BLOCKED: None,
        WorkflowState.DONE: None,
    }[state]


def mode_summary(mode: RunMode) -> str:
    return {
        RunMode.RUNNING: "Monitoring and launching eligible work.",
        RunMode.PAUSED: "New work is paused.",
        RunMode.DRAINING: "Active work may finish, but no new work will start.",
        RunMode.DISABLED: "Background monitoring is disabled.",
    }[mode]
