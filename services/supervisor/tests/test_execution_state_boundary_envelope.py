from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    ExecutionStateBoundaryApiEnvelope,
    ExecutionStateBoundaryView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _valid_report() -> dict[str, object]:
    return {
        "boundaryId": "queue-lease-execution-attempt-boundary-v1",
        "generatedAt": datetime(2026, 7, 20, 19, 30, tzinfo=timezone.utc),
        "summary": "Queue leases schedule supervisor work; execution attempts record worker-authority evidence without launching workers.",
        "queueLeaseRole": [
            "Track supervisor ownership of queued work.",
            "Record lease heartbeat, expiry, fencing token, and retry count.",
        ],
        "executionAttemptRole": [
            "Record route-bound worker, lane, authority mode, and lifecycle evidence.",
            "Provide the attachment point for any future process lifecycle evidence after explicit approval.",
        ],
        "forbiddenQueueLeaseFields": [
            "worker_id",
            "provider_endpoint",
            "process_id",
            "command_line",
            "credential_reference",
            "workspace_write_root",
            "approval_binding",
        ],
        "futureProcessLifecycleAttachments": [
            "stdout/stderr artifact references",
            "process supervisor id",
            "cancellation and timeout evidence",
            "workspace materialization id",
            "rollback artifact reference",
        ],
        "queueLeaseGrantsExecutionAuthority": False,
        "executionAttemptLaunchesWorkers": False,
    }


def test_execution_state_boundary_envelope_is_strict_and_typed() -> None:
    envelope = ExecutionStateBoundaryApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, ExecutionStateBoundaryView)
    assert (
        ExecutionStateBoundaryApiEnvelope.model_fields["data"].annotation
        is ExecutionStateBoundaryView
    )

    with pytest.raises(ValidationError):
        ExecutionStateBoundaryApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        ExecutionStateBoundaryApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )
    with pytest.raises(ValidationError):
        invalid_nested = _valid_report()
        invalid_nested["unexpected"] = "rejected"
        ExecutionStateBoundaryApiEnvelope.model_validate({"data": invalid_nested})
    with pytest.raises(ValidationError):
        invalid_safety_flag = _valid_report()
        invalid_safety_flag["executionAttemptLaunchesWorkers"] = True
        ExecutionStateBoundaryApiEnvelope.model_validate({"data": invalid_safety_flag})


def test_execution_state_boundary_route_uses_typed_envelope() -> None:
    route = _route("/supervisor/execution-state-boundary")

    assert route.response_model is ExecutionStateBoundaryApiEnvelope


def test_execution_state_boundary_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface ExecutionStateBoundaryApiEnvelope" in contract
    assert "data: ExecutionStateBoundaryView;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_execution_state_boundary_getter_is_sync_static_and_non_executing() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_execution_state_boundary(")
    end = source.index("    def _provider_enablement_policy_steps(", start)
    getter = source[start:end]

    assert "    async def get_execution_state_boundary(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "requests" not in getter.lower()
    assert "ExecutionStateBoundaryView(" in getter
    assert "without launching workers" in getter
