from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    AuditEventApiEnvelope,
    AuditEventView,
    WorkflowEventApiEnvelope,
    WorkflowEventView,
)


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_event_read_envelopes_have_typed_lists_and_preserve_optional_meta() -> None:
    workflow = WorkflowEventApiEnvelope.model_validate({"data": [], "meta": {"requestId": "req-1"}})
    audit = AuditEventApiEnvelope.model_validate({"data": []})

    assert workflow.data == []
    assert workflow.meta == {"requestId": "req-1"}
    assert audit.data == []
    assert audit.meta is None
    assert get_origin(WorkflowEventApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(WorkflowEventApiEnvelope.model_fields["data"].annotation) == (WorkflowEventView,)
    assert get_origin(AuditEventApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(AuditEventApiEnvelope.model_fields["data"].annotation) == (AuditEventView,)

    with pytest.raises(ValidationError):
        WorkflowEventApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_event_read_routes_are_owned_by_typed_envelopes() -> None:
    assert _route("/work-items/{work_item_id}/events").response_model is WorkflowEventApiEnvelope
    assert _route("/audit-events").response_model is AuditEventApiEnvelope


def test_shared_typescript_contract_names_and_fields_match_supervisor_models() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface WorkflowEventApiEnvelope" in contract_source
    assert "export interface AuditEventApiEnvelope" in contract_source
    assert "data: WorkflowEventView[];" in contract_source
    assert "data: AuditEventView[];" in contract_source
    assert 'mode: "none" | "advisory" | "required";' in contract_source
