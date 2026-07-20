from __future__ import annotations

import ast
import asyncio
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    EpicCompletionAuditReportApiEnvelope,
    EpicCompletionAuditReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _item(item_id: str, status: str) -> dict[str, object]:
    return {
        "itemId": item_id,
        "label": "Completion audit item",
        "status": status,
        "summary": "The bounded Epic 6 evidence is represented as metadata.",
        "evidence": ["story:6-27-epic-6-mvp-proof-trial-packet"],
    }


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "epic-6-completion-audit-report-v1",
        "generatedAt": datetime(2026, 7, 20, 19, 30, tzinfo=timezone.utc),
        "summary": "Read-only Epic 6 completion audit; post-MVP authority remains gated.",
        "epicId": "6",
        "overallStatus": "epic_6_mvp_complete",
        "completedItems": [_item("local-readiness-stack", "prepared_locally")],
        "remainingItems": [_item("post-mvp-autonomy", "blocked_by_default")],
        "blockedOperations": ["Launching additional Codex or Claude workers without bounded approval."],
        "recommendedApproval": "Use separate post-MVP approvals for provider or autonomy expansion.",
        "requiredEvidence": ["Retained Story 3.66 done evidence and delivery evidence."],
        "stopConditions": ["Stop if evidence or target scope becomes ambiguous."],
        "nextSafeActions": ["Run a post-MVP retrospective or hardening plan."],
        "readOnly": True,
        "epicComplete": True,
        "remoteDeliveryApproved": True,
        "providerExecutionApproved": False,
        "cleanupApproved": True,
    }


def test_epic_6_completion_audit_envelope_is_strict_and_typed() -> None:
    envelope = EpicCompletionAuditReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, EpicCompletionAuditReportView)
    assert (
        EpicCompletionAuditReportApiEnvelope.model_fields["data"].annotation
        is EpicCompletionAuditReportView
    )

    with pytest.raises(ValidationError):
        EpicCompletionAuditReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        EpicCompletionAuditReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )
    with pytest.raises(ValidationError):
        invalid_nested = _valid_report()
        invalid_nested["completedItems"][0]["unexpected"] = "rejected"  # type: ignore[index]
        EpicCompletionAuditReportApiEnvelope.model_validate({"data": invalid_nested})
    with pytest.raises(ValidationError):
        missing_safety = _valid_report()
        del missing_safety["cleanupApproved"]
        EpicCompletionAuditReportApiEnvelope.model_validate({"data": missing_safety})
    with pytest.raises(ValidationError):
        invalid_safety = _valid_report()
        invalid_safety["providerExecutionApproved"] = True
        EpicCompletionAuditReportApiEnvelope.model_validate({"data": invalid_safety})


def test_epic_6_completion_audit_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/epic-6-completion-audit-report")

    assert route.response_model is EpicCompletionAuditReportApiEnvelope
    result = asyncio.run(route.endpoint())
    assert isinstance(result, EpicCompletionAuditReportApiEnvelope)
    assert isinstance(result.data, EpicCompletionAuditReportView)


def test_epic_6_completion_audit_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface EpicCompletionAuditReportApiEnvelope" in contract
    assert "data: EpicCompletionAuditReportView;" in contract
    assert "readOnly: true;" in contract
    assert "epicComplete: true;" in contract
    assert "remoteDeliveryApproved: true;" in contract
    assert "providerExecutionApproved: false;" in contract
    assert "cleanupApproved: true;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_epic_6_completion_audit_getter_is_sync_static_and_non_executing() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_epic_6_completion_audit_report(")
    end = source.index("    def get_epic_6_mvp_proof_trial_report(", start)
    getter = source[start:end]

    assert "    async def get_epic_6_completion_audit_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "requests" not in getter.lower()
    assert "Read-only Epic 6 completion audit" in getter
    assert "do not launch claude" in getter.lower()
    assert "performs no GitHub mutation" in getter

    tree = ast.parse(textwrap.dedent(getter))
    calls = {
        ast.unparse(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
    }
    assert calls <= {"datetime.now", "EpicCompletionAuditItemView", "EpicCompletionAuditReportView"}
