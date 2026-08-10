"""Pure result fence for the private Memory Inbox inspection worker."""

from dataclasses import dataclass
from datetime import datetime

from supervisor.application.memory_inbox_scanner import ScannerOutcome
from supervisor.domain.memory_inbox import MemoryInboxSourceState


@dataclass(frozen=True)
class InspectionFenceDecision:
    accepted: bool
    target_state: MemoryInboxSourceState | None
    reason_code: str


def fence_inspection_result(
    *,
    source_state: str,
    source_current_revision: int,
    job_source_revision: int,
    job_state: str,
    cancelled_at: datetime | None,
    lease_expires_at: datetime | None,
    timeout_at: datetime | None,
    now: datetime,
    inspection_available: bool,
    format_valid: bool,
    scanner_outcome: ScannerOutcome,
    extraction_succeeded: bool,
) -> InspectionFenceDecision:
    """Accept exactly one current, claimed, non-expired inspection result.

    A failed or unavailable inspection deliberately remains Quarantined. Only
    an exact clean result may move the current quarantined Source to
    Unprocessed; an explicit unsafe scanner result moves it to RejectedUnsafe.
    """

    if source_state != MemoryInboxSourceState.QUARANTINED.value:
        return InspectionFenceDecision(False, None, "source_not_quarantined")
    if source_current_revision != job_source_revision:
        return InspectionFenceDecision(False, None, "source_revision_mismatch")
    if job_state != "Claimed":
        return InspectionFenceDecision(False, None, "job_not_claimed")
    if cancelled_at is not None:
        return InspectionFenceDecision(False, None, "inspection_job_cancelled")
    if lease_expires_at is None or timeout_at is None or now >= lease_expires_at or now >= timeout_at:
        return InspectionFenceDecision(False, None, "inspection_lease_expired")
    if not inspection_available:
        return InspectionFenceDecision(True, None, "inspection_unavailable")
    if not format_valid:
        return InspectionFenceDecision(True, None, "format_rejected")
    if scanner_outcome is ScannerOutcome.UNSAFE:
        return InspectionFenceDecision(True, MemoryInboxSourceState.REJECTED_UNSAFE, "scanner_detected_unsafe")
    if scanner_outcome is not ScannerOutcome.SAFE:
        return InspectionFenceDecision(True, None, "scanner_unavailable")
    if not extraction_succeeded:
        return InspectionFenceDecision(True, None, "extractor_unavailable")
    return InspectionFenceDecision(True, MemoryInboxSourceState.UNPROCESSED, "safe_to_act")
