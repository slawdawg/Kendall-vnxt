from __future__ import annotations

from pathlib import Path

from supervisor.api.main import app
from supervisor.api.schemas import WorkItemApiEnvelope, WorkItemView


def _route(path: str, method: str = "POST"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_work_item_create_route_uses_typed_envelope() -> None:
    assert _route("/work-items").response_model is WorkItemApiEnvelope
    assert WorkItemApiEnvelope.model_fields["data"].annotation is WorkItemView
    assert WorkItemApiEnvelope.model_config["extra"] == "forbid"

def test_work_item_create_route_reuses_shared_typescript_contract() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface WorkItemApiEnvelope" in contract_source
    assert "data: WorkItemView;" in contract_source
