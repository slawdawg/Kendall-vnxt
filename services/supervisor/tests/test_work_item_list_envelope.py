from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import WorkItemListApiEnvelope, WorkItemView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_work_item_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = WorkItemListApiEnvelope.model_validate({"data": [], "meta": {"requestId": "req-1"}})

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(WorkItemListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(WorkItemListApiEnvelope.model_fields["data"].annotation) == (WorkItemView,)

    with pytest.raises(ValidationError):
        WorkItemListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_work_item_list_route_uses_typed_envelope() -> None:
    assert _route("/work-items").response_model is WorkItemListApiEnvelope


def test_shared_typescript_work_item_list_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface WorkItemListApiEnvelope" in contract_source
    assert "data: WorkItemView[];" in contract_source
