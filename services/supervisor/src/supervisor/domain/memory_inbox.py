"""Closed, content-safe vocabulary for the private Memory Inbox aggregate."""

from enum import StrEnum


LIFECYCLE_SCHEMA_VERSION = "kendall-memory-inbox-lifecycle/v1"


class MemoryInboxSourceState(StrEnum):
    SCANNING = "Scanning"
    QUARANTINED = "Quarantined"
    UNPROCESSED = "Unprocessed"
    DRAFT = "Draft"
    AWAITING_AUTHORIZATION = "AwaitingAuthorization"
    PROCESSING = "Processing"
    REVIEW = "Review"
    RETURNED = "Returned"
    DENIED_RETAINED = "DeniedRetained"
    DELETE_PENDING = "DeletePending"
    DELETED = "Deleted"
    REJECTED_UNSAFE = "RejectedUnsafe"


class MemoryInboxProposalState(StrEnum):
    ABSENT = "Absent"
    DRAFT = "Draft"
    READY = "Ready"
    RETURNED = "Returned"
    DENIED = "Denied"
    APPROVED = "Approved"


class MemoryInboxAttemptState(StrEnum):
    PLANNED = "Planned"
    CLAIMED = "Claimed"
    DISPATCHED = "Dispatched"
    COMPLETION_UNKNOWN = "CompletionUnknown"
    RECONCILED = "Reconciled"
    CANCELLED = "Cancelled"
    CLOSED = "Closed"


class MemoryInboxDeletionState(StrEnum):
    NONE = "None"
    PENDING = "Pending"
    PROVEN = "Proven"
    RETRY_NEEDED = "RetryNeeded"


def is_positive_revision(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def can_advance_lifecycle(*, current: MemoryInboxSourceState, target: MemoryInboxSourceState) -> bool:
    """Future transactional commands must use this closed grammar; this story invokes none."""

    if current == target:
        return False
    terminal = {MemoryInboxSourceState.DELETED, MemoryInboxSourceState.REJECTED_UNSAFE}
    if current in terminal:
        return False
    return target in MemoryInboxSourceState
