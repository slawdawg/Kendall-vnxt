from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ClaudeReviewReadinessReportApiEnvelope, ClaudeReviewReadinessReportView


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _check(check_id: str, label: str) -> dict[str, object]:
    return {
        "checkId": check_id,
        "label": label,
        "status": "not_checked",
        "summary": f"{label} was not executed.",
        "evidence": ["policy:no-launch-readiness"],
    }


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "claude-review-readiness-report-v1",
        "generatedAt": "2026-07-20T19:30:00Z",
        "summary": "No-launch Claude review readiness remains read-only and scarce-use bounded.",
        "cliPath": "/usr/local/bin/claude",
        "reviewPolicy": [
            _check("cli-discovery", "CLI discovery"),
            _check("auth-posture", "Auth posture"),
            _check("review-only", "Review-only posture"),
            _check("source-mutation", "Source mutation"),
        ],
        "scarcityPolicy": [
            _check("scarce-use", "Scarce use"),
            _check("budget-record", "Budget record"),
            _check("review-trigger", "Review trigger"),
        ],
        "stopLines": [
            "This report does not approve Claude CLI process launch.",
            "This report does not approve sending code, diffs, prompts, repository context, or credentials to Claude.",
            "This report does not approve consuming scarce Claude subscription usage.",
        ],
        "nextSafeActions": [
            "Define a review-only command shape before bounded Claude review execution."
        ],
        "readOnly": True,
        "processLaunchApproved": False,
        "reviewTaskExecutionApproved": False,
        "sourceMutationApproved": False,
        "scarceUseApproved": False,
    }


def test_claude_review_readiness_envelope_is_strict_and_typed() -> None:
    envelope = ClaudeReviewReadinessReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, ClaudeReviewReadinessReportView)
    assert (
        ClaudeReviewReadinessReportApiEnvelope.model_fields["data"].annotation
        is ClaudeReviewReadinessReportView
    )

    with pytest.raises(ValidationError):
        ClaudeReviewReadinessReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        ClaudeReviewReadinessReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )


def test_claude_review_readiness_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/claude-review-readiness-report")

    assert route.response_model is ClaudeReviewReadinessReportApiEnvelope


def test_claude_review_readiness_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface ClaudeReviewReadinessReportApiEnvelope" in contract
    assert "data: ClaudeReviewReadinessReportView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_claude_review_readiness_getter_is_sync_no_launch_and_no_provider_call() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_claude_review_readiness_report(")
    end = source.index("    def get_claude_review_approval_report(", start)
    getter = source[start:end]

    assert "    async def get_claude_review_readiness_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "shutil.which(\"claude\")" in getter
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "requests" not in getter.lower()
    assert "does not run Claude" in getter
