from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import DashboardE2EReportApiEnvelope, DashboardE2EReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "dashboard-e2e-1",
        "generatedAt": "2026-07-20T16:00:00Z",
        "summary": "Dashboard verification remains read-only.",
        "runners": [],
        "setupCommands": [],
        "stopLines": ["Do not run dashboard commands without an approved lane."],
        "nextSafeActions": ["Continue with the documented verification path."],
    }


def test_dashboard_e2e_report_envelope_is_strict_and_typed():
    assert DashboardE2EReportApiEnvelope.model_fields["data"].annotation is DashboardE2EReportView
    assert DashboardE2EReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        DashboardE2EReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        DashboardE2EReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_dashboard_e2e_report_route_uses_typed_envelope():
    assert _route("/supervisor/dashboard-e2e-report").response_model is DashboardE2EReportApiEnvelope


def test_shared_typescript_dashboard_e2e_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface DashboardE2EReportApiEnvelope" in contract_source
    assert "data: DashboardE2EReportView;" in contract_source
