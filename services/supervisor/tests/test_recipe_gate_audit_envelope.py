from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import WorkItemRecipeGateAuditApiEnvelope, WorkItemRecipeGateAuditView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_recipe_gate_audit_envelope_has_typed_data_and_forbids_extra_keys() -> None:
    assert WorkItemRecipeGateAuditApiEnvelope.model_fields["data"].annotation is WorkItemRecipeGateAuditView
    assert WorkItemRecipeGateAuditApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        WorkItemRecipeGateAuditApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_recipe_gate_audit_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/recipe-gate-audit").response_model is WorkItemRecipeGateAuditApiEnvelope


def test_shared_typescript_recipe_gate_audit_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/api.ts"
    ).read_text(encoding="utf-8")

    assert "export interface WorkItemRecipeGateAuditApiEnvelope" in contract_source
    assert "data: WorkItemRecipeGateAuditView;" in contract_source
