from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import DevelopmentRunwayReportApiEnvelope, DevelopmentRunwayReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "development-runway-report-v1",
        "generatedAt": "2026-07-20T17:45:00Z",
        "summary": "The runway remains bounded by reviewable slices.",
        "planningRule": "Prefer one coherent PR per safe slice.",
        "minimumPrScope": "At least two aligned surfaces.",
        "batchingPolicy": [],
        "prBatchingChecklist": [],
        "slices": [],
        "verificationChain": ["pnpm run check:development-runway"],
        "stopLines": ["Do not treat runway planning as execution authority."],
        "nextSafeActions": ["Continue with the smallest verified slice."],
        "readOnly": True,
        "executionAuthorityApproved": False,
        "remoteAutomationApproved": False,
    }


def test_development_runway_envelope_is_strict_and_typed():
    assert DevelopmentRunwayReportApiEnvelope.model_fields["data"].annotation is DevelopmentRunwayReportView
    assert DevelopmentRunwayReportApiEnvelope.model_config["extra"] == "forbid"

    envelope = DevelopmentRunwayReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"partial": False, "source": "supervisor"}})
    assert envelope.data.reportId == "development-runway-report-v1"

    with pytest.raises(ValidationError):
        DevelopmentRunwayReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        DevelopmentRunwayReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_development_runway_route_uses_typed_envelope():
    assert _route("/supervisor/development-runway-report").response_model is DevelopmentRunwayReportApiEnvelope


def test_shared_typescript_development_runway_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface DevelopmentRunwayReportApiEnvelope" in contract_source
    assert "data: DevelopmentRunwayReportView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
