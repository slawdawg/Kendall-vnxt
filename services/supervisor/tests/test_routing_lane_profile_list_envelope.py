from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    RoutingLaneEvidenceProfileView,
    RoutingLaneProfileListApiEnvelope,
)


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_routing_lane_profile_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = RoutingLaneProfileListApiEnvelope.model_validate(
        {"data": [], "meta": {"requestId": "req-1"}}
    )

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(RoutingLaneProfileListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(RoutingLaneProfileListApiEnvelope.model_fields["data"].annotation) == (
        RoutingLaneEvidenceProfileView,
    )

    with pytest.raises(ValidationError):
        RoutingLaneProfileListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_routing_lane_profile_route_uses_typed_envelope() -> None:
    assert _route("/routing/lane-profiles").response_model is RoutingLaneProfileListApiEnvelope


def test_shared_typescript_routing_lane_profile_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/api.ts"
    ).read_text(encoding="utf-8")

    assert "export interface RoutingLaneProfileListApiEnvelope" in contract_source
    assert "data: RoutingLaneEvidenceProfileView[];" in contract_source
