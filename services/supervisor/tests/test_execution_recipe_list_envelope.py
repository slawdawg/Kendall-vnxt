from __future__ import annotations

from pathlib import Path
from typing import get_args, get_origin

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ExecutionRecipeListApiEnvelope, WorkItemExecutionRecipeView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_execution_recipe_list_envelope_has_typed_list_and_optional_meta() -> None:
    envelope = ExecutionRecipeListApiEnvelope.model_validate({"data": [], "meta": {"requestId": "req-1"}})

    assert envelope.data == []
    assert envelope.meta == {"requestId": "req-1"}
    assert get_origin(ExecutionRecipeListApiEnvelope.model_fields["data"].annotation) is list
    assert get_args(ExecutionRecipeListApiEnvelope.model_fields["data"].annotation) == (WorkItemExecutionRecipeView,)

    with pytest.raises(ValidationError):
        ExecutionRecipeListApiEnvelope.model_validate({"data": [], "unexpected": True})


def test_execution_recipe_list_route_uses_typed_envelope() -> None:
    assert _route("/execution-recipes").response_model is ExecutionRecipeListApiEnvelope


def test_shared_typescript_execution_recipe_list_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface ExecutionRecipeListApiEnvelope" in contract_source
    assert "data: WorkItemExecutionRecipeView[];" in contract_source
