"""Closed, inert vocabulary for the persisted Hermes outcome ledger.

This module deliberately contains no adapter, credential, worker, board, or
GitHub behavior. It only protects the Supervisor-owned metadata boundary.
"""

from __future__ import annotations

HERMES_RESULT_VALUES = frozenset({
    "allowed",
    "deniedPolicy",
    "deniedExternalImpact",
    "staleFacts",
    "retryable",
    "rework",
    "blockedTechnical",
    "completed",
})
HERMES_OUTCOME_STATUSES = frozenset({"proposed", "active", "review", "completed", "blocked", "rework"})
HERMES_LANE_RUN_STATUSES = frozenset({"queued", "running", "review", "rework", "completed", "blocked"})
HERMES_LIFECYCLE_EVENT_NAMES = frozenset({
    "hermes.outcome.created",
    "hermes.lane.recovered",
    "hermes.delivery.denied",
    "hermes.external-impact.requested",
    "hermes.review.disposition.recorded",
    "hermes.verification.recorded",
    "hermes.review.unavailable_reviewer.blocked",
})
TERMINAL_RESULTS = frozenset({"completed", "deniedPolicy", "deniedExternalImpact", "blockedTechnical"})


def is_valid_result(value: str) -> bool:
    return value in HERMES_RESULT_VALUES


def can_replace_current_result(*, previous: str, next_result: str) -> bool:
    """Prevent a terminal projection from silently becoming active again.

    A later recovery needs a new lane run and a fresh evidence record, not a
    mutation of a terminal run's result. The exact recovery protocol remains
    separate from this first persistence slice.
    """

    return previous not in TERMINAL_RESULTS or next_result == previous
