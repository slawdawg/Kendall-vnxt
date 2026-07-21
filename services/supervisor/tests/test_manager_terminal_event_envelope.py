from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

import supervisor.api.main as main_module
from supervisor.api.main import app
from supervisor.api.schemas import (
    ManagerTerminalEventApiEnvelope,
    ManagerTerminalEventRequest,
    ManagerTerminalEventView,
    SupervisorTerminalEventProjection,
    SupervisorTerminalEventProjectionApiEnvelope,
)


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


def test_terminal_event_routes_use_declared_supervisor_envelope():
    assert _route("/manager-control-plane/terminal-events").response_model is ManagerTerminalEventApiEnvelope
    assert _route("/manager-control-plane/terminal-events/{event_id}").response_model is ManagerTerminalEventApiEnvelope
    assert _route("/supervisor/terminal-event").response_model is SupervisorTerminalEventProjectionApiEnvelope


def test_supervisor_terminal_event_projection_preserves_empty_and_available_read_only_shapes(monkeypatch):
    empty = AsyncMock(return_value=None)
    monkeypatch.setattr(main_module, "get_latest_manager_terminal_event", empty)
    empty_projection = asyncio.run(main_module.get_supervisor_terminal_event(session=object()))
    assert isinstance(empty_projection, SupervisorTerminalEventProjectionApiEnvelope)
    assert empty_projection.data.status == "empty"
    assert empty_projection.data.event is None
    assert empty_projection.data.owner == "supervisor"
    assert empty_projection.data.metadataOnly is True
    assert empty_projection.data.rawPayloadRetained is False

    view = ManagerTerminalEventView.model_validate(_valid_view())
    available = AsyncMock(return_value=view)
    monkeypatch.setattr(main_module, "get_latest_manager_terminal_event", available)
    available_projection = asyncio.run(main_module.get_supervisor_terminal_event(session=object()))
    assert isinstance(available_projection.data, SupervisorTerminalEventProjection)
    assert available_projection.data.status == "available"
    assert available_projection.data.event == view
    available.assert_awaited_once()


def test_terminal_event_post_handler_returns_declared_supervisor_envelope(monkeypatch):
    view = ManagerTerminalEventView.model_validate(_valid_view())
    request = ManagerTerminalEventRequest.model_validate(
        {key: value for key, value in _valid_view().items() if key not in {"owner", "createdAt"}}
    )
    persist = AsyncMock(return_value=view)
    monkeypatch.setattr(main_module, "persist_manager_terminal_event", persist)

    envelope = asyncio.run(
        main_module.record_manager_terminal_event(
            payload=request,
            _=None,
            session=object(),
        )
    )

    assert isinstance(envelope, ManagerTerminalEventApiEnvelope)
    assert envelope.data == view
    persist.assert_awaited_once()


def test_shared_terminal_event_contract_matches_python_boundary():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/manager-control-plane/terminal-event.ts").read_text(encoding="utf-8")
    assert "export interface ManagerTerminalEventView extends ManagerTerminalEventRequest" in contract_source
    assert "export interface ManagerTerminalEventApiEnvelope" in contract_source
    assert "export interface SupervisorTerminalEventProjection" in contract_source
    assert 'owner: "supervisor"' in contract_source
    assert 'rawPayloadRetained: false' in contract_source
    assert "Readonly<Record<string, string | number | boolean | null>>" in contract_source
