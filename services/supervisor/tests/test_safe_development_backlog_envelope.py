from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import SafeDevelopmentBacklogReportApiEnvelope, SafeDevelopmentBacklogReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "safe-development-backlog-1",
        "generatedAt": "2026-07-20T17:00:00Z",
        "summary": "The safe development backlog remains evidence-scoped.",
        "items": [],
        "stopLines": ["Do not promote backlog entries without fresh evidence."],
        "nextSafeActions": ["Select the smallest verified development slice."],
    }


def test_safe_development_backlog_envelope_is_strict_and_typed():
    assert SafeDevelopmentBacklogReportApiEnvelope.model_fields["data"].annotation is SafeDevelopmentBacklogReportView
    assert SafeDevelopmentBacklogReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        SafeDevelopmentBacklogReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        SafeDevelopmentBacklogReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_safe_development_backlog_route_uses_typed_envelope():
    assert _route("/supervisor/safe-development-backlog").response_model is SafeDevelopmentBacklogReportApiEnvelope


def test_shared_typescript_safe_backlog_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface SafeDevelopmentBacklogReportApiEnvelope" in contract_source
    assert "data: SafeDevelopmentBacklogReportView;" in contract_source
