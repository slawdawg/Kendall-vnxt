from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import AuthoritativeWorkPacketApiEnvelope, AuthoritativeWorkPacketLifecycleView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_authoritative_work_packet_detail_envelope_is_strict() -> None:
    assert AuthoritativeWorkPacketApiEnvelope.model_fields["data"].annotation is AuthoritativeWorkPacketLifecycleView
    assert AuthoritativeWorkPacketApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        AuthoritativeWorkPacketApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_authoritative_work_packet_detail_route_uses_typed_envelope() -> None:
    assert _route("/pipeline-control-plane/work-packets/{packet_id}").response_model is AuthoritativeWorkPacketApiEnvelope


def test_shared_typescript_authoritative_work_packet_detail_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/pipeline-control-plane/index.ts"
    ).read_text(encoding="utf-8")

    assert "export interface AuthoritativeWorkPacketApiEnvelope" in contract_source
    assert "data: AuthoritativeWorkPacketLifecycleView;" in contract_source
