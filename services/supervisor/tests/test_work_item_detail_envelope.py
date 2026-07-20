from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import WorkItemApiEnvelope, WorkItemView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_work_item_detail_envelope_has_typed_data_and_forbids_extra_keys() -> None:
    assert WorkItemApiEnvelope.model_fields["data"].annotation is WorkItemView
    assert WorkItemApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        WorkItemApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_work_item_detail_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}").response_model is WorkItemApiEnvelope


def test_shared_typescript_work_item_detail_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/api.ts"
    ).read_text(encoding="utf-8")

    assert "export interface WorkItemApiEnvelope" in contract_source
    assert "data: WorkItemView;" in contract_source
