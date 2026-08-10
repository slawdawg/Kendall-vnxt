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
    """The only legal Source state transitions; delete/expiry wins every race."""

    transitions = {
        MemoryInboxSourceState.SCANNING: {MemoryInboxSourceState.QUARANTINED, MemoryInboxSourceState.REJECTED_UNSAFE, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.QUARANTINED: {MemoryInboxSourceState.UNPROCESSED, MemoryInboxSourceState.REJECTED_UNSAFE, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.UNPROCESSED: {MemoryInboxSourceState.DRAFT, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.DRAFT: {MemoryInboxSourceState.AWAITING_AUTHORIZATION, MemoryInboxSourceState.RETURNED, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.AWAITING_AUTHORIZATION: {MemoryInboxSourceState.PROCESSING, MemoryInboxSourceState.RETURNED, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.PROCESSING: {MemoryInboxSourceState.REVIEW, MemoryInboxSourceState.AWAITING_AUTHORIZATION, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.REVIEW: {MemoryInboxSourceState.RETURNED, MemoryInboxSourceState.DENIED_RETAINED, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.RETURNED: {MemoryInboxSourceState.DRAFT, MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.DENIED_RETAINED: {MemoryInboxSourceState.DELETE_PENDING},
        MemoryInboxSourceState.DELETE_PENDING: {MemoryInboxSourceState.DELETED},
        MemoryInboxSourceState.DELETED: set(),
        MemoryInboxSourceState.REJECTED_UNSAFE: {MemoryInboxSourceState.DELETE_PENDING},
    }
    return target in transitions[current]
