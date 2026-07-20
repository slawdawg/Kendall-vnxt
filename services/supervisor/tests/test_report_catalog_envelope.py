from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import SupervisorReportCatalogApiEnvelope, SupervisorReportCatalogView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_catalog() -> dict[str, object]:
    return {
        "catalogId": "report-catalog-1",
        "generatedAt": "2026-07-20T16:30:00Z",
        "summary": "Supervisor reports remain read-only and evidence-scoped.",
        "reports": [],
        "stopLines": ["Do not infer authority from catalog presence."],
        "nextSafeActions": ["Use the report-specific evidence contract."],
    }


def test_report_catalog_envelope_is_strict_and_typed():
    assert SupervisorReportCatalogApiEnvelope.model_fields["data"].annotation is SupervisorReportCatalogView
    assert SupervisorReportCatalogApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        SupervisorReportCatalogApiEnvelope.model_validate({"data": _valid_catalog(), "unexpected": True})

    with pytest.raises(ValidationError):
        SupervisorReportCatalogApiEnvelope.model_validate({"data": _valid_catalog(), "meta": {"nested": {"blocked": True}}})


def test_report_catalog_route_uses_typed_envelope():
    assert _route("/supervisor/report-catalog").response_model is SupervisorReportCatalogApiEnvelope


def test_shared_typescript_report_catalog_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface SupervisorReportCatalogApiEnvelope" in contract_source
    assert "data: SupervisorReportCatalogView;" in contract_source
