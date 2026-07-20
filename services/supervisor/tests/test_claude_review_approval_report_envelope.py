from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    ClaudeReviewApprovalReportApiEnvelope,
    ClaudeReviewApprovalReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _requirement(requirement_id: str, label: str) -> dict[str, object]:
    return {
        "requirementId": requirement_id,
        "label": label,
        "status": "allowed",
        "summary": f"{label} is represented as a bounded policy requirement.",
        "evidence": ["policy:claude-review-approval"],
    }


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "claude-review-approval-report-v1",
        "generatedAt": "2026-07-20T19:30:00Z",
        "summary": "Read-only approval packet for a future bounded Claude adversarial review.",
        "approvalPrompt": "Approve one bounded Claude review-only attempt for one selected work item.",
        "authorityFamily": "claude_review",
        "operation": "one_time_bounded_review_only_attempt",
        "triggerPolicy": [
            _requirement("explicit-request", "Explicit request"),
            _requirement("high-risk-diff", "High-risk diff"),
            _requirement("codex-output-check", "Codex output check"),
            {
                **_requirement("routine-generation", "Routine generation"),
                "status": "blocked",
            },
        ],
        "contextScope": ["Named work item and bounded changed-file summary."],
        "blockedInputs": ["Credentials, tokens, secrets, and unrelated repository context."],
        "expectedCommandShape": [
            "claude <review-only non-interactive mode> --cwd <approved-worktree> -- <bounded review packet>"
        ],
        "outputContract": ["Risk-ranked findings with file/path references where applicable."],
        "requiredEvidence": ["Review reason, bounded context scope, exit status, and findings artifact location."],
        "scarcityControls": ["One bounded attempt; no routine generation or edit mode."],
        "stopConditions": ["Stop if the request expands beyond the approved work item or review-only scope."],
        "nextSafeActions": ["Review this packet without launching Claude."],
        "readOnly": True,
        "processLaunchApproved": False,
        "reviewTaskExecutionApproved": False,
        "sourceMutationApproved": False,
        "scarceUseApproved": False,
        "approvalBindingImplemented": False,
    }


def test_claude_review_approval_envelope_is_strict_and_typed() -> None:
    envelope = ClaudeReviewApprovalReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, ClaudeReviewApprovalReportView)
    assert (
        ClaudeReviewApprovalReportApiEnvelope.model_fields["data"].annotation
        is ClaudeReviewApprovalReportView
    )

    with pytest.raises(ValidationError):
        ClaudeReviewApprovalReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        ClaudeReviewApprovalReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )


def test_claude_review_approval_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/claude-review-approval-report")

    assert route.response_model is ClaudeReviewApprovalReportApiEnvelope


def test_claude_review_approval_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface ClaudeReviewApprovalReportApiEnvelope" in contract
    assert "data: ClaudeReviewApprovalReportView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_claude_review_approval_getter_is_sync_no_launch_and_no_provider_call() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_claude_review_approval_report(")
    end = source.index("    def get_review_resource_policy_report(", start)
    getter = source[start:end]

    assert "    async def get_claude_review_approval_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "requests" not in getter.lower()
    assert "launch Claude" in getter
    assert "send code or diffs" in getter
