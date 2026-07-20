from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import WorkerRegistryEntryView, WorkerRegistryListApiEnvelope


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_worker_registry_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = WorkerRegistryListApiEnvelope.model_validate(
        {"data": [], "meta": {"requestId": "req-1"}}
    )

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(WorkerRegistryListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(WorkerRegistryListApiEnvelope.model_fields["data"].annotation) == (
        WorkerRegistryEntryView,
    )

    with pytest.raises(ValidationError):
        WorkerRegistryListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_worker_registry_route_uses_typed_envelope() -> None:
    assert _route("/routing/worker-registry").response_model is WorkerRegistryListApiEnvelope


def test_shared_typescript_worker_registry_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/api.ts"
    ).read_text(encoding="utf-8")

    assert "export interface WorkerRegistryListApiEnvelope" in contract_source
    assert "data: WorkerRegistryEntryView[];" in contract_source
