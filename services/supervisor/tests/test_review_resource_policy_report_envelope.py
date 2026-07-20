from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    ReviewResourcePolicyReportApiEnvelope,
    ReviewResourcePolicyReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "review-resource-policy-report-v1",
        "generatedAt": datetime(2026, 7, 20, 19, 30, tzinfo=timezone.utc),
        "summary": "Read-only policy map for bounded review routing; it does not launch review tools.",
        "triggers": [
            {
                "triggerId": "high_risk_diff",
                "label": "High-risk diff",
                "status": "trigger",
                "summary": "Broad or hard-to-revert diffs can justify bounded critique.",
                "evidenceSignals": ["cross-module contract change"],
                "recommendedRoutes": ["bmad_party_mode", "claude_readonly_review"],
            }
        ],
        "routes": [
            {
                "routeId": "claude_readonly_review",
                "label": "Claude read-only",
                "authorityFamily": "external-review-readonly",
                "status": "approval_required_or_policy_triggered_readonly",
                "summary": "Use Claude only as a scarce bounded read-only critic.",
                "allowedWhen": ["high_risk_diff"],
                "commandPolicy": ["claude -p", "--max-budget-usd 1", "--tools Read,Grep"],
                "retainedEvidence": ["purpose", "scope", "summarized findings"],
                "blockedCapabilities": ["edit tools", "shell tools", "GitHub mutation"],
                "budgetCap": "--max-budget-usd 1",
            }
        ],
        "scenarios": [
            {
                "scenarioId": "routine-low-risk-docs",
                "label": "Routine low-risk docs",
                "triggerIds": [],
                "selectedRoutes": [],
                "policyBasis": "No review trigger is present.",
                "retentionSummary": "No external review evidence is required.",
                "nextSafeAction": "Use normal local verification.",
            }
        ],
        "packetEvaluations": [
            {
                "packetId": "sample-authority-security-packet",
                "packetKind": "work-packet-review-policy-fixture",
                "triggerIds": ["high_risk_diff"],
                "selectedRoutes": ["claude_readonly_review"],
                "decisionBasis": "Bounded critique is required before trust expansion.",
                "retainedEvidence": ["policy basis", "verification result references"],
                "stopLines": ["Do not launch Claude from this policy evaluation."],
                "readOnly": True,
                "processLaunchApproved": False,
                "sourceMutationApproved": False,
                "githubMutationApproved": False,
                "rawProviderPayloadsRetained": False,
                "rawReasoningRetained": False,
            }
        ],
        "claudeReadOnlyCommand": [
            "claude -p",
            "--max-budget-usd 1",
            "--tools Read,Grep",
            "<bounded review prompt>",
        ],
        "retentionPolicy": "summaries_findings_paths_command_metadata_verification_policy_basis_only",
        "stopLines": ["Stop if the review requires more scope or mutation authority."],
        "nextSafeActions": ["Apply any review fixes through the implementation lane."],
        "readOnly": True,
        "processLaunchApproved": False,
        "sourceMutationApproved": False,
        "githubMutationApproved": False,
        "rawProviderPayloadsRetained": False,
        "rawReasoningRetained": False,
    }


def test_review_resource_policy_envelope_is_strict_and_typed() -> None:
    envelope = ReviewResourcePolicyReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, ReviewResourcePolicyReportView)
    assert (
        ReviewResourcePolicyReportApiEnvelope.model_fields["data"].annotation
        is ReviewResourcePolicyReportView
    )

    with pytest.raises(ValidationError):
        ReviewResourcePolicyReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        ReviewResourcePolicyReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )
    with pytest.raises(ValidationError):
        invalid_nested = _valid_report()
        invalid_nested["triggers"][0]["unexpected"] = "rejected"  # type: ignore[index]
        ReviewResourcePolicyReportApiEnvelope.model_validate({"data": invalid_nested})
    for safety_flag in (
        "processLaunchApproved",
        "sourceMutationApproved",
        "githubMutationApproved",
        "rawProviderPayloadsRetained",
        "rawReasoningRetained",
    ):
        with pytest.raises(ValidationError):
            invalid_safety_flag = _valid_report()
            invalid_safety_flag[safety_flag] = True
            ReviewResourcePolicyReportApiEnvelope.model_validate({"data": invalid_safety_flag})


def test_review_resource_policy_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/review-resource-policy-report")

    assert route.response_model is ReviewResourcePolicyReportApiEnvelope


def test_review_resource_policy_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface ReviewResourcePolicyReportApiEnvelope" in contract
    assert "data: ReviewResourcePolicyReportView;" in contract
    assert "readOnly: true;" in contract
    assert "processLaunchApproved: false;" in contract
    assert "sourceMutationApproved: false;" in contract
    assert "githubMutationApproved: false;" in contract
    assert "rawProviderPayloadsRetained: false;" in contract
    assert "rawReasoningRetained: false;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_review_resource_policy_getter_is_sync_static_and_non_executing() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_review_resource_policy_report(")
    end = source.index("    def get_github_delivery_authority_report(", start)
    getter = source[start:end]

    assert "    async def get_review_resource_policy_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "requests" not in getter.lower()
    assert "does not launch review tools" in getter
    assert "Do not mutate source" in getter
