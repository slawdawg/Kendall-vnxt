from datetime import datetime, timedelta, timezone

from supervisor.application.memory_inbox_inspection_result import fence_inspection_result
from supervisor.application.memory_inbox_scanner import ScannerOutcome


def fence(**overrides):
    now = datetime.now(timezone.utc)
    values = {
        "source_state": "Quarantined", "source_current_revision": 2,
        "job_source_revision": 2, "job_state": "Claimed",
        "cancelled_at": None,
        "lease_expires_at": now + timedelta(seconds=10),
        "timeout_at": now + timedelta(seconds=10), "now": now,
        "inspection_available": True, "format_valid": True, "scanner_outcome": ScannerOutcome.SAFE,
        "extraction_succeeded": True,
    }
    values.update(overrides)
    return fence_inspection_result(**values)


def test_only_a_current_claimed_clean_result_can_make_a_source_actionable() -> None:
    decision = fence()

    assert decision.accepted
    assert decision.target_state.value == "Unprocessed"
    assert decision.reason_code == "safe_to_act"


def test_late_or_mismatched_results_cannot_change_a_source() -> None:
    assert fence(job_state="Closed").reason_code == "job_not_claimed"
    assert fence(job_source_revision=1).reason_code == "source_revision_mismatch"
    assert fence(cancelled_at=datetime.now(timezone.utc)).reason_code == "inspection_job_cancelled"
    assert fence(lease_expires_at=datetime.now(timezone.utc) - timedelta(seconds=1)).reason_code == "inspection_lease_expired"


def test_failures_stay_quarantined_and_unsafe_results_are_explicitly_rejected() -> None:
    assert fence(format_valid=False).target_state is None
    assert fence(scanner_outcome=ScannerOutcome.UNAVAILABLE).target_state is None
    assert fence(scanner_outcome=ScannerOutcome.UNSAFE).target_state.value == "RejectedUnsafe"
    assert fence(extraction_succeeded=False).target_state is None
    assert fence(inspection_available=False).reason_code == "inspection_unavailable"
