from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    CodexImplementationApprovalReportApiEnvelope,
    CodexImplementationApprovalReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _evaluation() -> dict[str, object]:
    return {
        "status": "blocked",
        "launchApproved": False,
        "processLaunchAttempted": False,
        "blockedReason": "approval_binding_not_implemented",
        "unsafeField": None,
        "summary": "The bounded launch contract remains read-only.",
    }


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "codex-implementation-approval-report-v1",
        "generatedAt": "2026-07-20T19:30:00Z",
        "summary": "Read-only approval packet for a future bounded Codex implementation run.",
        "approvalPrompt": "Approve one bounded Codex implementation attempt for one selected work item.",
        "authorityFamily": "codex_implementation",
        "operation": "one_time_bounded_implementation_attempt",
        "targetScope": ["One named Active work item or story."],
        "allowedPaths": ["services/supervisor/**"],
        "blockedPaths": [".git/**", ".env and credential files"],
        "expectedCommandShape": ["codex <non-interactive task mode> --cwd <approved-worktree>"],
        "requiredEvidence": ["changed-file list and diffstat"],
        "rollbackPlan": ["Leave changes in the isolated worktree until review."],
        "stopConditions": ["Stop if the task expands beyond the approved story."],
        "requirements": [
            {
                "requirementId": "approval-binding",
                "label": "Approval binding",
                "status": "not_implemented",
                "summary": "A future launch requires a bound approval.",
                "evidence": ["policy:no-launch"],
            }
        ],
        "launchContract": {
            "contractId": "codex-launch-contract-v1",
            "targetWorkItem": "<selected-active-work-item>",
            "routeDecision": "<current-route-decision-id>",
            "attemptId": "<planned-execution-attempt-id>",
            "workerId": "codex.local",
            "lane": "utility",
            "authorityMode": "operator_approved_bounded_source_mutation",
            "workspacePlan": "isolated-codex-worktree",
            "approvalBinding": {
                "workItemId": "<selected-active-work-item>",
                "routeDecisionId": "<current-route-decision-id>",
                "attemptId": "<planned-execution-attempt-id>",
                "workerId": "codex.local",
                "lane": "utility",
                "authorityMode": "operator_approved_bounded_source_mutation",
                "workspacePlanId": "isolated-codex-worktree",
                "policyId": "codex-implementation-policy-v1",
                "approvedScope": ["services/supervisor/**"],
                "expiresAt": "2026-07-21T19:30:00Z",
            },
            "permissionEnvelope": {
                "allowedPaths": ["services/supervisor/**"],
                "blockedPaths": [".git/**"],
                "allowedCommandShape": ["codex <non-interactive task mode>"],
                "verificationCommand": "pnpm run check",
                "timeoutSeconds": 900,
                "budget": "bounded",
                "evidenceOutputs": ["diffstat", "verification exit codes"],
                "stopConditions": ["outside approved worktree"],
            },
            "evidenceToRetain": ["metadata-only process start/finish"],
            "evaluation": _evaluation(),
        },
        "launchContractFixtures": [
            {
                "fixtureId": "outside-worktree",
                "label": "Outside worktree path",
                "mutatedField": "targetPath",
                "evaluation": _evaluation(),
            }
        ],
        "blockedAuthorities": [
            {
                "authorityId": "provider_expansion",
                "label": "Provider expansion",
                "status": "blocked",
                "summary": "Provider expansion remains separately gated.",
            }
        ],
        "nextSafeActions": ["Review the packet without launching Codex."],
        "readOnly": True,
        "processLaunchApproved": False,
        "workerTaskExecutionApproved": False,
        "sourceMutationApproved": False,
        "approvalBindingImplemented": False,
    }


def test_codex_implementation_approval_envelope_is_strict_and_typed() -> None:
    envelope = CodexImplementationApprovalReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, CodexImplementationApprovalReportView)
    assert (
        CodexImplementationApprovalReportApiEnvelope.model_fields["data"].annotation
        is CodexImplementationApprovalReportView
    )

    with pytest.raises(ValidationError):
        CodexImplementationApprovalReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        CodexImplementationApprovalReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )


def test_codex_implementation_approval_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/codex-implementation-approval-report")

    assert route.response_model is CodexImplementationApprovalReportApiEnvelope


def test_codex_implementation_approval_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface CodexImplementationApprovalReportApiEnvelope" in contract
    assert "data: CodexImplementationApprovalReportView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_codex_implementation_approval_getter_is_sync_static_and_no_provider_bound() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_codex_implementation_approval_report(")
    end = source.index("    def _codex_launch_contract(", start)
    getter = source[start:end]

    assert "    async def get_codex_implementation_approval_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "ollama" not in getter.lower()
    assert ".provider" not in getter
    assert "It does not launch Codex" in getter
