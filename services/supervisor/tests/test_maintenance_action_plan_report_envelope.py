from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import MaintenanceActionPlanReportApiEnvelope, MaintenanceActionPlanReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "maintenance-action-plan-1",
        "generatedAt": "2026-07-20T16:45:00Z",
        "summary": "Maintenance actions remain bounded by verification evidence.",
        "steps": [],
        "verificationChain": ["Run focused checks before any lane delivery."],
        "stopLines": ["Do not treat an action plan as execution authority."],
        "nextSafeActions": ["Continue with the smallest verified action."],
    }


def test_maintenance_action_plan_envelope_is_strict_and_typed():
    assert MaintenanceActionPlanReportApiEnvelope.model_fields["data"].annotation is MaintenanceActionPlanReportView
    assert MaintenanceActionPlanReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        MaintenanceActionPlanReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        MaintenanceActionPlanReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_maintenance_action_plan_route_uses_typed_envelope():
    assert _route("/supervisor/maintenance-action-plan-report").response_model is MaintenanceActionPlanReportApiEnvelope


def test_shared_typescript_maintenance_action_plan_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface MaintenanceActionPlanReportApiEnvelope" in contract_source
    assert "data: MaintenanceActionPlanReportView;" in contract_source
