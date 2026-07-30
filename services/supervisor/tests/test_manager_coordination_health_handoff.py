from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from supervisor.api.schemas import ManagerCoordinationHealthHandoffRequest
from supervisor.infrastructure.db.models import ManagerCoordinationHealthHandoff


def _payload() -> dict[str, object]:
    return {
        "schemaVersion": "manager-coordination-health-handoff/v0",
        "handoffId": f"manager-coordination-health-handoff:{'b' * 40}",
        "sourceSequence": 1785369600000,
        "coordinationHealth": {
            "schemaVersion": "manager-coordination-health/v0",
            "runId": "run:coordination",
            "observedAt": datetime(2026, 7, 30, tzinfo=UTC),
            "source": "manager_workspace_inventory",
            "freshness": "fresh",
            "availability": "incomplete",
            "activeWorkCount": 2,
            "staleOwnerTargetCount": 17,
            "staleOwnerProjectedCount": 12,
            "dirtyPreserveCount": 3,
            "missingWorktreeJournalHold": True,
            "nextSafeAction": "Preserve dirty worktrees and refresh the canonical inventory.",
            "evidenceRefs": ["manager:assignment-report", "manager:stale-owner-inspection"],
            "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "idempotencyKey": "manager-coordination-health:run:coordination:1785369600000",
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def test_coordination_health_handoff_accepts_honest_bounded_metadata_only_snapshot() -> None:
    request = ManagerCoordinationHealthHandoffRequest.model_validate(_payload())
    assert request.coordinationHealth.staleOwnerTargetCount == 17
    assert request.coordinationHealth.staleOwnerProjectedCount == 12
    assert request.coordinationHealth.availability == "incomplete"


def test_coordination_health_handoff_rejects_false_completeness_and_unsafe_transport_metadata() -> None:
    incomplete = _payload()
    incomplete["coordinationHealth"] = {**incomplete["coordinationHealth"], "availability": "available"}
    with pytest.raises(ValidationError, match="must be marked incomplete"):
        ManagerCoordinationHealthHandoffRequest.model_validate(incomplete)
    unsafe = _payload()
    unsafe["idempotencyKey"] = " secret:coordination"
    with pytest.raises(ValidationError):
        ManagerCoordinationHealthHandoffRequest.model_validate(unsafe)
    unavailable = _payload()
    unavailable["coordinationHealth"] = {**unavailable["coordinationHealth"], "freshness": "unavailable"}
    with pytest.raises(ValidationError, match="must agree"):
        ManagerCoordinationHealthHandoffRequest.model_validate(unavailable)
    unsafe_evidence = _payload()
    unsafe_evidence["coordinationHealth"] = {**unsafe_evidence["coordinationHealth"], "evidenceRefs": ["ghp_abcdefghijklmnopqrstuvwxyz"]}
    with pytest.raises(ValidationError, match="evidenceRefs"):
        ManagerCoordinationHealthHandoffRequest.model_validate(unsafe_evidence)


def test_coordination_health_handoff_has_database_sequence_and_idempotency_backstops() -> None:
    constraints = {constraint.name: tuple(column.name for column in constraint.columns) for constraint in ManagerCoordinationHealthHandoff.__table__.constraints}
    assert constraints["uq_manager_coordination_health_handoff_sequence"] == ("source_sequence",)
