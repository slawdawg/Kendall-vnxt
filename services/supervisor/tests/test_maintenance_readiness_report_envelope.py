from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import MaintenanceReadinessReportApiEnvelope, MaintenanceReadinessReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "maintenance-readiness-1",
        "generatedAt": "2026-07-20T16:30:00Z",
        "summary": "Maintenance remains evidence-scoped and read-only.",
        "tracks": [],
        "stopLines": ["Do not infer execution authority from readiness alone."],
        "nextSafeActions": ["Continue bounded maintenance verification."],
    }


def test_maintenance_readiness_report_envelope_is_strict_and_typed():
    assert MaintenanceReadinessReportApiEnvelope.model_fields["data"].annotation is MaintenanceReadinessReportView
    assert MaintenanceReadinessReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        MaintenanceReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        MaintenanceReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_maintenance_readiness_route_uses_typed_envelope():
    assert _route("/supervisor/maintenance-readiness-report").response_model is MaintenanceReadinessReportApiEnvelope


def test_shared_typescript_maintenance_readiness_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface MaintenanceReadinessReportApiEnvelope" in contract_source
    assert "data: MaintenanceReadinessReportView;" in contract_source
