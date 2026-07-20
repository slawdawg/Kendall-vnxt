from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ExecutionReadinessReportApiEnvelope, ExecutionReadinessReportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "readiness-1",
        "generatedAt": "2026-07-20T14:00:00Z",
        "summary": "Execution remains read-only.",
        "providerEnablementPolicy": [],
        "disabledAuthorityChecks": [],
        "disabledProviderProofs": [],
        "currentAttempts": [],
        "latestOutcomes": [],
        "nextSafeActions": ["Keep execution disabled."],
    }


def test_execution_readiness_report_envelope_is_strict_and_typed() -> None:
    assert ExecutionReadinessReportApiEnvelope.model_fields["data"].annotation is ExecutionReadinessReportView
    assert ExecutionReadinessReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        ExecutionReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        ExecutionReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_execution_readiness_report_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/execution-readiness-report").response_model is ExecutionReadinessReportApiEnvelope


def test_shared_typescript_execution_readiness_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface ExecutionReadinessReportApiEnvelope" in contract_source
    assert "data: ExecutionReadinessReportView;" in contract_source
