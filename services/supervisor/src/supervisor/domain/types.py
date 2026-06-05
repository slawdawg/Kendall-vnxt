from enum import StrEnum


class WorkflowState(StrEnum):
    QUEUED = "queued"
    TRIAGED = "triaged"
    READY = "ready"
    IMPLEMENTING = "implementing"
    VALIDATING = "validating"
    REVIEWING = "reviewing"
    AWAITING_AUDIT = "awaiting_audit"
    NEEDS_REWORK = "needs_rework"
    BLOCKED = "blocked"
    DONE = "done"


class BmadLane(StrEnum):
    INTAKE = "intake"
    IMPLEMENTATION = "implementation"
    VALIDATION = "validation"
    REVIEW = "review"
    CORRECTIVE_LOOP = "corrective_loop"


class RunMode(StrEnum):
    RUNNING = "running"
    PAUSED = "paused"
    DRAINING = "draining"
    DISABLED = "disabled"


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class AuditMode(StrEnum):
    NONE = "none"
    ADVISORY = "advisory"
    REQUIRED = "required"


class WorkItemFilterScope(StrEnum):
    QUEUE = "queue"
    ACTIVE_WORK = "active-work"
    AUDIT = "audit"


class WorkflowAction(StrEnum):
    SUBMIT_FOR_VALIDATION = "submit_for_validation"
    VALIDATION_PASSED = "validation_passed"
    VALIDATION_FAILED = "validation_failed"
    APPROVE_REVIEW = "approve_review"
    COMPLETE_AUDIT_REVIEW = "complete_audit_review"
    REQUEST_REWORK = "request_rework"
    RESTART_IMPLEMENTATION = "restart_implementation"
    RETURN_TO_READY = "return_to_ready"


class ErrorCategory(StrEnum):
    TRANSIENT = "transient"
    TERMINAL = "terminal"
    OPERATOR_ACTIONABLE = "operator_actionable"
