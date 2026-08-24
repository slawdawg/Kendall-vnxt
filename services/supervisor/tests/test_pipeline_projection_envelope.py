from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.schemas import (
    PipelineActiveManagerLaneClarityGoalV0View,
    PipelineActiveManagerLaneClarityV0View,
    PipelineDashboardProjectionApiEnvelope,
    PipelineDashboardProjectionV0View,
)

def test_pipeline_projection_envelope_has_typed_data_and_forbids_extra_keys() -> None:
    assert PipelineDashboardProjectionApiEnvelope.model_fields["data"].annotation is PipelineDashboardProjectionV0View
    assert PipelineDashboardProjectionApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        PipelineDashboardProjectionApiEnvelope.model_validate({"data": {}, "unexpected": True})

def test_shared_typescript_pipeline_projection_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/pipeline-control-plane/index.ts"
    ).read_text(encoding="utf-8")

    assert "export interface PipelineDashboardProjectionApiEnvelope" in contract_source
    assert "data: PipelineDashboardProjectionV0;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
    assert "activeManagerLaneClarity?: NonNullable<ManagerExecutionLaneSummary[\"laneClarity\"]> | null;" in contract_source
    assert "activeManagerLaneClarity" in PipelineDashboardProjectionV0View.model_fields


def test_lane_clarity_view_rejects_unsafe_metadata() -> None:
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityGoalV0View.model_validate(
            {"summary": "api_key=must-not-be-retained", "sourceRef": "requirement:lane-clarity"}
        )
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityGoalV0View.model_validate(
            {"summary": "Safe summary.", "sourceRef": "ghp_abcdefghijkl"}
        )
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityGoalV0View.model_validate(
            {"summary": "ghp_abcdefghijkl", "sourceRef": "requirement:lane-clarity"}
        )


def test_lane_clarity_view_requires_evidence_for_assessed_postures() -> None:
    payload = {
        "runId": "run:lane-clarity",
        "eventWatermark": "event:lane-clarity",
        "sourceCursor": "cursor:1",
        "goal": {"summary": "Keep lane evidence coherent.", "sourceRef": "requirement:lane-clarity"},
        "criteria": [],
        "canonicalState": {"phase": "no_safe_work", "freshness": "fresh", "evidenceFreshness": "fresh"},
        "nextGate": {"summary": "Review evidence.", "nextSafeAction": "review_lane_clarity"},
        "posture": {"state": "on_scope", "reason": "Evidence is current.", "nextSafeAction": "review_lane_clarity"},
    }
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityV0View.model_validate(payload)
    payload["criteria"] = [{
        "criterionId": "criterion:carrier",
        "summary": "Carrier is coherent.",
        "disposition": "in_progress",
        "evidenceRefs": ["evidence:lane-clarity"],
    }]
    payload["posture"] = {
        "state": "on_scope",
        "reason": "Evidence is current.",
        "nextSafeAction": "review_lane_clarity",
    }
    payload["canonicalState"]["freshness"] = "stale"
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityV0View.model_validate(payload)
    payload["canonicalState"]["freshness"] = "fresh"
    payload["canonicalState"]["evidenceFreshness"] = "missing"
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityV0View.model_validate(payload)
    payload["canonicalState"]["evidenceFreshness"] = "fresh"
    payload["posture"]["state"] = "not_assessed"
    assert PipelineActiveManagerLaneClarityV0View.model_validate(payload).canonicalState.phase == "no_safe_work"
    payload["posture"] = {
        "state": "pivot_required",
        "reason": "A scope decision is current.",
        "nextSafeAction": "review_scope_pivot",
    }
    with pytest.raises(ValidationError):
        PipelineActiveManagerLaneClarityV0View.model_validate(payload)
