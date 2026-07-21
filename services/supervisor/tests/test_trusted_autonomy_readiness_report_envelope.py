from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    TrustedAutonomyReadinessReportApiEnvelope,
    TrustedAutonomyReadinessReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "trusted-autonomy-readiness-report-v1",
        "generatedAt": datetime(2026, 7, 21, 4, 45, tzinfo=timezone.utc),
        "summary": "Read-only readiness report.",
        "autonomyGates": [
            {
                "gateId": "repeatable-low-risk-work",
                "label": "Repeatable low-risk work",
                "status": "blocked",
                "summary": "Requires evidence before graduation.",
                "evidence": ["verification packet"],
            }
        ],
        "deauthorizationTriggers": [
            {
                "triggerId": "scope-expansion",
                "label": "Scope expansion",
                "status": "stop",
                "summary": "Stop when scope expands.",
                "deauthorizedOperations": ["provider calls"],
                "recoveryEvidence": ["operator decision"],
            }
        ],
        "eligibleWork": ["read-only inspection"],
        "blockedWork": ["autonomous execution"],
        "requiredEvidence": ["local verification"],
        "stopConditions": ["ambiguous authority"],
        "nextSafeActions": ["continue bounded implementation"],
        "readOnly": True,
        "lowRiskAutonomyApproved": False,
        "autonomousProviderUseApproved": False,
        "autonomousGitHubDeliveryApproved": False,
        "autonomousCleanupApproved": False,
    }


def test_trusted_autonomy_readiness_envelope_is_strict_and_typed() -> None:
    envelope = TrustedAutonomyReadinessReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, TrustedAutonomyReadinessReportView)
    assert (
        TrustedAutonomyReadinessReportApiEnvelope.model_fields["data"].annotation
        is TrustedAutonomyReadinessReportView
    )

    with pytest.raises(ValidationError):
        TrustedAutonomyReadinessReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        invalid = _valid_report()
        invalid["readOnly"] = False
        TrustedAutonomyReadinessReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = _valid_report()
        invalid["autonomousCleanupApproved"] = True
        TrustedAutonomyReadinessReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = _valid_report()
        invalid["autonomyGates"] = [{**invalid["autonomyGates"][0], "unexpected": True}]  # type: ignore[index]
        TrustedAutonomyReadinessReportApiEnvelope.model_validate({"data": invalid})


def test_trusted_autonomy_readiness_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/trusted-autonomy-readiness-report")

    assert route.response_model is TrustedAutonomyReadinessReportApiEnvelope


def test_trusted_autonomy_readiness_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface TrustedAutonomyReadinessReportApiEnvelope" in contract
    assert "data: TrustedAutonomyReadinessReportView;" in contract
    assert "readOnly: true;" in contract
    assert "lowRiskAutonomyApproved: false;" in contract
    assert "autonomousProviderUseApproved: false;" in contract
    assert "autonomousGitHubDeliveryApproved: false;" in contract
    assert "autonomousCleanupApproved: false;" in contract
