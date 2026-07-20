from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ManagedRecipePolicyReportApiEnvelope, ManagedRecipePolicyReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "managed-recipe-policy-report-v1",
        "generatedAt": "2026-07-20T18:20:00Z",
        "summary": "Managed recipes remain bounded by explicit policy gates.",
        "recipes": [],
        "stopLines": ["Do not treat recipe policy as execution authority."],
        "nextSafeActions": ["Continue with the smallest verified recipe slice."],
        "readOnly": True,
        "executionAuthorityApproved": False,
        "remoteAutomationApproved": False,
    }


def test_managed_recipe_policy_envelope_is_strict_and_typed():
    assert ManagedRecipePolicyReportApiEnvelope.model_fields["data"].annotation is ManagedRecipePolicyReportView
    assert ManagedRecipePolicyReportApiEnvelope.model_config["extra"] == "forbid"

    envelope = ManagedRecipePolicyReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"partial": False, "source": "supervisor"}})
    assert envelope.data.reportId == "managed-recipe-policy-report-v1"

    with pytest.raises(ValidationError):
        ManagedRecipePolicyReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        ManagedRecipePolicyReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_managed_recipe_policy_route_uses_typed_envelope():
    assert _route("/supervisor/managed-recipe-policy-report").response_model is ManagedRecipePolicyReportApiEnvelope


def test_shared_typescript_managed_recipe_policy_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface ManagedRecipePolicyReportApiEnvelope" in contract_source
    assert "data: ManagedRecipePolicyReportView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
