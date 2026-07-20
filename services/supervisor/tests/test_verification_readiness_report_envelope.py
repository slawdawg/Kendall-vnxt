from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import VerificationReadinessReportApiEnvelope, VerificationReadinessReportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "verification-readiness-1",
        "generatedAt": "2026-07-20T15:30:00Z",
        "summary": "Verification evidence is bounded and reviewable.",
        "requiredCommands": [],
        "optionalCommands": [],
        "commandGroups": [],
        "handoffCheckpoints": [],
        "stopLines": ["Do not enable authority without evidence."],
        "nextSafeActions": ["Run the required checks."],
    }


def test_verification_readiness_report_envelope_is_strict_and_typed() -> None:
    assert VerificationReadinessReportApiEnvelope.model_fields["data"].annotation is VerificationReadinessReportView
    assert VerificationReadinessReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        VerificationReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        VerificationReadinessReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_verification_readiness_report_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/verification-readiness-report").response_model is VerificationReadinessReportApiEnvelope


def test_shared_typescript_verification_readiness_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface VerificationReadinessReportApiEnvelope" in contract_source
    assert "data: VerificationReadinessReportView;" in contract_source
