from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import CodexReadinessReportApiEnvelope, CodexReadinessReportView


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "codex-readiness-report-v1",
        "generatedAt": "2026-07-20T19:30:00Z",
        "summary": "Codex readiness remains read-only and review-bounded.",
        "cliPath": "/usr/local/bin/codex",
        "checks": [
            {
                "checkId": "cli-discovery",
                "label": "CLI discovery",
                "status": "not_checked",
                "summary": "CLI discovery was not executed.",
                "evidence": ["policy:read-only-report"],
            }
        ],
        "stopLines": [
            "Do not treat Codex readiness as process-launch or source-mutation approval."
        ],
        "nextSafeActions": [
            "Review readiness evidence before any separately approved launch."
        ],
        "readOnly": True,
        "processLaunchApproved": False,
        "workerTaskExecutionApproved": False,
        "sourceMutationApproved": False,
    }


def test_codex_readiness_report_envelope_is_strict_and_typed() -> None:
    envelope = CodexReadinessReportApiEnvelope.model_validate({"data": _valid_report()})

    assert isinstance(envelope.data, CodexReadinessReportView)
    assert CodexReadinessReportApiEnvelope.model_fields["data"].annotation is CodexReadinessReportView

    with pytest.raises(ValidationError):
        CodexReadinessReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        CodexReadinessReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )


def test_codex_readiness_report_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/codex-readiness-report")

    assert route.response_model is CodexReadinessReportApiEnvelope


def test_codex_readiness_report_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface CodexReadinessReportApiEnvelope" in contract
    assert "data: CodexReadinessReportView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract
