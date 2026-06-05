from enum import StrEnum


class WorkflowState(StrEnum):
    QUEUED = "queued"
    TRIAGED = "triaged"
    READY = "ready"
    IMPLEMENTING = "implementing"
    VALIDATING = "validating"
    REVIEWING = "reviewing"
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


class ErrorCategory(StrEnum):
    TRANSIENT = "transient"
    TERMINAL = "terminal"
    OPERATOR_ACTIONABLE = "operator_actionable"
