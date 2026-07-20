from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import GitHygieneReportApiEnvelope, GitHygieneReportView


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "git-hygiene-report-v1",
        "generatedAt": "2026-07-20T19:30:00Z",
        "summary": "Git hygiene remains read-only and review-bounded.",
        "repoRoot": "/home/operator/Kendall_Nxt",
        "currentBranch": "dev",
        "headRevision": "abc1234",
        "upstreamBranch": "origin/dev",
        "workingTreeStatus": "clean",
        "statusCounts": {
            "added": 0,
            "modified": 0,
            "deleted": 0,
            "renamed": 0,
            "untracked": 0,
            "conflicted": 0,
        },
        "worktrees": [
            {
                "path": "/home/operator/Kendall_Nxt",
                "branch": "dev",
                "head": "abc1234",
                "detached": False,
                "locked": False,
                "prunable": False,
            }
        ],
        "localSignals": [
            {
                "signalId": "working-tree",
                "label": "Working tree",
                "status": "clean",
                "summary": "No changes.",
                "evidence": ["command:git-status"],
            }
        ],
        "remoteSignals": [
            {
                "signalId": "pull-request",
                "label": "Pull request",
                "status": "not_queried",
                "summary": "Remote PR state was not queried.",
                "evidence": ["policy:remote-read-disabled"],
            }
        ],
        "stopLines": [
            "Do not treat Git hygiene as push, merge, or cleanup approval."
        ],
        "nextSafeActions": [
            "Review local Git evidence before delivery decisions."
        ],
        "readOnly": True,
        "remoteMutationApproved": False,
        "cleanupApproved": False,
    }


def test_git_hygiene_report_envelope_is_strict_and_typed() -> None:
    envelope = GitHygieneReportApiEnvelope.model_validate({"data": _valid_report()})

    assert isinstance(envelope.data, GitHygieneReportView)
    assert GitHygieneReportApiEnvelope.model_fields["data"].annotation is GitHygieneReportView

    with pytest.raises(ValidationError):
        GitHygieneReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        GitHygieneReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )


def test_git_hygiene_report_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/git-hygiene-report")

    assert route.response_model is GitHygieneReportApiEnvelope


def test_git_hygiene_report_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface GitHygieneReportApiEnvelope" in contract
    assert "data: GitHygieneReportView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract
