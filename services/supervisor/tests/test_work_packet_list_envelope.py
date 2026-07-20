from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    AuthoritativeWorkPacketLifecycleView,
    AuthoritativeWorkPacketListApiEnvelope,
)


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_work_packet_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = AuthoritativeWorkPacketListApiEnvelope.model_validate(
        {"data": [], "meta": {"requestId": "req-1"}}
    )

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(AuthoritativeWorkPacketListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(AuthoritativeWorkPacketListApiEnvelope.model_fields["data"].annotation) == (
        AuthoritativeWorkPacketLifecycleView,
    )

    with pytest.raises(ValidationError):
        AuthoritativeWorkPacketListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_work_packet_list_route_uses_typed_envelope() -> None:
    assert _route("/pipeline-control-plane/work-packets").response_model is AuthoritativeWorkPacketListApiEnvelope


def test_shared_typescript_work_packet_list_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/pipeline-control-plane/index.ts"
    ).read_text(encoding="utf-8")

    assert "export interface AuthoritativeWorkPacketListApiEnvelope" in contract_source
    assert "data: AuthoritativeWorkPacketLifecycleView[];" in contract_source
