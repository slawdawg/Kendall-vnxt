from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from supervisor.api.schemas import ManagerLaneClarityHandoffRequest
from supervisor.infrastructure.db.models import ManagerLaneClarityHandoff


def _payload() -> dict[str, object]:
    return {
        "schemaVersion": "manager-lane-clarity-handoff/v0",
        "handoffId": f"manager-lane-clarity-handoff:{'a' * 40}",
        "selectedLaneId": "lane:current",
        "runId": "run:current",
        "eventWatermark": "event:current",
        "sourceCursor": "cursor:1",
        "sourceSequence": 1,
        "observedAt": datetime(2026, 7, 29, tzinfo=UTC),
        "laneClarity": {
            "schemaVersion": "manager-lane-clarity/v0",
            "runId": "run:current",
            "eventWatermark": "event:current",
            "sourceCursor": "cursor:1",
            "goal": {"summary": "Keep the transport bounded.", "sourceRef": "requirement:handoff"},
            "criteria": [{"criterionId": "criterion:binding", "summary": "Binding stays coherent.", "disposition": "met", "evidenceRefs": ["evidence:binding"]}],
            "canonicalState": {"phase": "running", "freshness": "fresh", "evidenceFreshness": "fresh"},
            "nextGate": {"summary": "Verify receipt.", "nextSafeAction": "verify_handoff"},
            "posture": {"state": "on_scope", "reason": "Current metadata is coherent.", "nextSafeAction": "continue", "decisionRef": None, "qualification": None},
            "metadataOnly": True,
            "rawPayloadRetained": False,
        },
        "idempotencyKey": "handoff:lane:current:1",
        "metadataOnly": True,
        "rawPayloadRetained": False,
    }


def test_lane_clarity_handoff_requires_exact_nested_identity() -> None:
    request = ManagerLaneClarityHandoffRequest.model_validate(_payload())
    assert request.laneClarity.runId == request.runId
    invalid = _payload()
    invalid["sourceCursor"] = "cursor:2"
    with pytest.raises(ValidationError, match="exactly match"):
        ManagerLaneClarityHandoffRequest.model_validate(invalid)


def test_lane_clarity_handoff_rejects_unsafe_or_nonpositive_transport_metadata() -> None:
    invalid = _payload()
    invalid["sourceSequence"] = 0
    with pytest.raises(ValidationError):
        ManagerLaneClarityHandoffRequest.model_validate(invalid)
    unsafe = _payload()
    unsafe["idempotencyKey"] = "secret:abcdef"
    with pytest.raises(ValidationError):
        ManagerLaneClarityHandoffRequest.model_validate(unsafe)


def test_lane_clarity_handoff_has_a_database_backstop_for_per_lane_sequence_races() -> None:
    constraints = {constraint.name: tuple(column.name for column in constraint.columns) for constraint in ManagerLaneClarityHandoff.__table__.constraints}
    assert constraints["uq_manager_lane_clarity_handoff_sequence"] == ("selected_lane_id", "source_sequence")
