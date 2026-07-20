from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import WorkPacketApiEnvelope, WorkPacketV0View


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_work_packet_detail_envelope_has_typed_data_and_optional_meta() -> None:
    with pytest.raises(ValidationError):
        WorkPacketApiEnvelope.model_validate({"data": {}, "unexpected": True})

    assert get_origin(WorkPacketApiEnvelope.model_fields["data"].annotation) is None
    assert get_args(WorkPacketApiEnvelope.model_fields["data"].annotation) == ()
    assert WorkPacketApiEnvelope.model_fields["data"].annotation is WorkPacketV0View


def test_work_packet_detail_route_uses_typed_envelope() -> None:
    assert _route("/work-packets/{packet_id}").response_model is WorkPacketApiEnvelope


def test_shared_typescript_work_packet_detail_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/work-packet.ts"
    ).read_text(encoding="utf-8")

    assert "export interface WorkPacketApiEnvelope" in contract_source
    assert "data: WorkPacketV0View;" in contract_source
