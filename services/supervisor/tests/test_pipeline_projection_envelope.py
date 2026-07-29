from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    PipelineActiveManagerLaneClarityGoalV0View,
    PipelineDashboardProjectionApiEnvelope,
    PipelineDashboardProjectionV0View,
)


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_pipeline_projection_envelope_has_typed_data_and_forbids_extra_keys() -> None:
    assert PipelineDashboardProjectionApiEnvelope.model_fields["data"].annotation is PipelineDashboardProjectionV0View
    assert PipelineDashboardProjectionApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        PipelineDashboardProjectionApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_pipeline_projection_route_uses_typed_envelope() -> None:
    assert _route("/pipeline-control-plane/projection").response_model is PipelineDashboardProjectionApiEnvelope


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
