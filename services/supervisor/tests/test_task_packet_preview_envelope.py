from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import TaskPacketPreviewApiEnvelope, TaskPacketPreviewView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_task_packet_preview_envelope_is_strict_and_typed() -> None:
    assert TaskPacketPreviewApiEnvelope.model_fields["data"].annotation is TaskPacketPreviewView
    assert TaskPacketPreviewApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        TaskPacketPreviewApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_task_packet_preview_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/task-packet-preview").response_model is TaskPacketPreviewApiEnvelope


def test_shared_typescript_task_packet_preview_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface TaskPacketPreviewApiEnvelope" in contract_source
    assert "data: TaskPacketPreviewView;" in contract_source
