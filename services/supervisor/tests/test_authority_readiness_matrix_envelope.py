from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import AuthorityReadinessMatrixReportApiEnvelope, AuthorityReadinessMatrixReportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "authority-matrix-1",
        "generatedAt": "2026-07-20T15:30:00Z",
        "summary": "Authority remains gated by evidence.",
        "currentStateFindings": [],
        "nextLaneDecisionPacket": {
            "packetId": "decision-packet-1",
            "status": "approval-required",
            "recommendation": "Keep execution authority gated.",
            "packetPath": "_bmad-output/decision-packet.md",
            "requiredFreshnessCheck": "Revalidate evidence before the next lane.",
            "nextAction": "Collect the missing evidence.",
        },
        "families": [],
        "readinessLadder": [],
        "stopLines": ["Do not expand authority without a decision packet."],
        "nextSafeActions": ["Continue evidence collection."],
    }


def test_authority_readiness_matrix_envelope_is_strict_and_typed() -> None:
    assert AuthorityReadinessMatrixReportApiEnvelope.model_fields["data"].annotation is AuthorityReadinessMatrixReportView
    assert AuthorityReadinessMatrixReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        AuthorityReadinessMatrixReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        AuthorityReadinessMatrixReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_authority_readiness_matrix_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/authority-readiness-matrix-report").response_model is AuthorityReadinessMatrixReportApiEnvelope


def test_shared_typescript_authority_matrix_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface AuthorityReadinessMatrixReportApiEnvelope" in contract_source
    assert "data: AuthorityReadinessMatrixReportView;" in contract_source
