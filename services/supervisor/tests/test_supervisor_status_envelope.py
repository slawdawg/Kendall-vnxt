from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import RunStatusApiEnvelope, RunStatusView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_status() -> dict[str, object]:
    return {
        "mode": "running",
        "revision": 1,
        "pollIntervalSeconds": 5,
        "queueCount": 0,
        "activeCount": 0,
        "activeWorkCount": 0,
        "activeLeaseCount": 0,
        "runningAttemptCount": 0,
        "drainConverged": True,
        "blockedCount": 0,
        "doneCount": 1,
        "summary": "Supervisor is idle.",
    }


def test_supervisor_status_envelope_is_strict_and_typed() -> None:
    assert RunStatusApiEnvelope.model_fields["data"].annotation is RunStatusView
    assert RunStatusApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        RunStatusApiEnvelope.model_validate({"data": _valid_status(), "unexpected": True})

    with pytest.raises(ValidationError):
        RunStatusApiEnvelope.model_validate({"data": _valid_status(), "meta": {"nested": {"blocked": True}}})


def test_supervisor_status_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/status").response_model is RunStatusApiEnvelope


def test_shared_typescript_supervisor_status_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface RunStatusApiEnvelope" in contract_source
    assert "data: RunStatusView;" in contract_source
    assert "activeWorkCount: number;" in contract_source
    assert "drainConverged: boolean;" in contract_source
