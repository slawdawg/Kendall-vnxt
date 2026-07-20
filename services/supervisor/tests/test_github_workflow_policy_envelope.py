from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import GitHubWorkflowPolicyReportApiEnvelope, GitHubWorkflowPolicyReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "github-workflow-policy-report-v1",
        "generatedAt": "2026-07-20T19:10:00Z",
        "summary": "GitHub workflow policy remains read-only and approval-bounded.",
        "authModel": [
            {
                "itemId": "git-gcm-remotes",
                "label": "Git/GCM remotes",
                "status": "preferred",
                "summary": "Use Git credential manager for remotes.",
                "evidence": ["source:github-workflow-policy"],
            }
        ],
        "requiredChecks": [
            {
                "itemId": "github-doctor-local",
                "label": "Local GitHub doctor",
                "status": "required_for_local_acceptance",
                "summary": "Run the local doctor before delivery review.",
                "evidence": ["check:github-doctor-local"],
            }
        ],
        "stopLines": ["Do not treat workflow policy as remote delivery approval."],
        "nextSafeActions": ["Record Git/GCM evidence before any delivery decision."],
        "readOnly": True,
        "executionAuthorityApproved": False,
        "plaintextTokenStorageApproved": False,
        "remoteAutomationApproved": False,
    }


def test_github_workflow_policy_envelope_is_strict_and_typed():
    assert GitHubWorkflowPolicyReportApiEnvelope.model_fields["data"].annotation is GitHubWorkflowPolicyReportView
    assert GitHubWorkflowPolicyReportApiEnvelope.model_config["extra"] == "forbid"

    envelope = GitHubWorkflowPolicyReportApiEnvelope.model_validate(
        {"data": _valid_report(), "meta": {"partial": False, "source": "supervisor"}}
    )
    assert envelope.data.reportId == "github-workflow-policy-report-v1"

    with pytest.raises(ValidationError):
        GitHubWorkflowPolicyReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        GitHubWorkflowPolicyReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"blocked": True}}}
        )


def test_github_workflow_policy_route_uses_typed_envelope():
    assert _route("/supervisor/github-workflow-policy-report").response_model is GitHubWorkflowPolicyReportApiEnvelope


def test_shared_typescript_github_workflow_policy_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface GitHubWorkflowPolicyReportApiEnvelope" in contract_source
    assert "data: GitHubWorkflowPolicyReportView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
