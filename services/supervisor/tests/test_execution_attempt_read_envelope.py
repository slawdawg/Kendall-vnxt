from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ExecutionAttemptApiEnvelope, ExecutionAttemptView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_execution_attempt_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = ExecutionAttemptApiEnvelope.model_validate({"data": [], "meta": {"requestId": "req-1"}})

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(ExecutionAttemptApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(ExecutionAttemptApiEnvelope.model_fields["data"].annotation) == (ExecutionAttemptView,)

    with pytest.raises(ValidationError):
        ExecutionAttemptApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_execution_attempt_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/execution-attempts").response_model is ExecutionAttemptApiEnvelope


def test_shared_typescript_execution_attempt_contract_matches_python_fields() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface ExecutionAttemptApiEnvelope" in contract_source
    assert "data: ExecutionAttemptView[];" in contract_source
    assert "leaseId?: string | null;" in contract_source
    assert "fencingToken?: number | null;" in contract_source
