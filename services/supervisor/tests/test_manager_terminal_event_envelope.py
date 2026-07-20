from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ManagerTerminalEventApiEnvelope, ManagerTerminalEventView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_view() -> dict[str, object]:
    return {
        "eventId": f"manager-terminal-event:{'a' * 40}",
        "eventType": "authoritative_backlog_exhausted",
        "runId": "manager-run-17",
        "sourceIdentity": "source-bundle:accepted-product-backlog",
        "sourceRevision": "git:abc1234",
        "reconciliationCounts": {
            "totalItems": 1,
            "reconciledItems": 1,
            "eligible": 0,
            "queued": 0,
            "leased": 0,
            "running": 0,
            "reviewFix": 0,
            "requiredRetrospective": 0,
            "otherwiseRequired": 0,
            "completed": 0,
            "closed": 0,
            "approvalGated": 1,
        },
        "unresolvedApprovalGatedWork": [
            {
                "workId": "approval-work-1",
                "title": "Operator-selected planning bundle",
                "reason": "Explicit product acceptance is still required",
                "sourceRefs": ["source:planning-bundle-1"],
                "evidenceRefs": ["evidence:approval-gate-1"],
            }
        ],
        "evidenceRefs": ["evidence:reconciliation-17"],
        "resumeRequirement": "Start a new run bound to newly accepted source-owned backlog.",
        "nextManagerAction": "Wait for newly accepted source-owned backlog.",
        "idempotencyKey": "authoritative-backlog-exhausted:run-17",
        "metadataOnly": True,
        "rawPayloadRetained": False,
        "owner": "supervisor",
        "createdAt": "2026-07-20T05:42:11.123Z",
    }


def test_terminal_event_envelope_is_strict_and_typed():
    assert ManagerTerminalEventApiEnvelope.model_fields["data"].annotation is ManagerTerminalEventView
    assert ManagerTerminalEventApiEnvelope.model_config["extra"] == "forbid"

    envelope = ManagerTerminalEventApiEnvelope.model_validate({"data": _valid_view(), "meta": {"source": "supervisor", "partial": False}})
    assert envelope.data.owner == "supervisor"

    with pytest.raises(ValidationError):
        ManagerTerminalEventApiEnvelope.model_validate({"data": _valid_view(), "unexpected": True})

    with pytest.raises(ValidationError):
        ManagerTerminalEventApiEnvelope.model_validate({"data": _valid_view(), "meta": {"nested": {"blocked": True}}})


def test_terminal_event_read_route_uses_declared_supervisor_envelope():
    assert _route("/manager-control-plane/terminal-events/{event_id}").response_model is ManagerTerminalEventApiEnvelope


def test_shared_terminal_event_contract_matches_python_boundary():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/manager-control-plane/terminal-event.ts").read_text(encoding="utf-8")
    assert "export interface ManagerTerminalEventView extends ManagerTerminalEventRequest" in contract_source
    assert "export interface ManagerTerminalEventApiEnvelope" in contract_source
    assert "Readonly<Record<string, string | number | boolean | null>>" in contract_source
