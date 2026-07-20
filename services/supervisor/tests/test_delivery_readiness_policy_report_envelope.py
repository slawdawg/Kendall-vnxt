from __future__ import annotations

import ast
import asyncio
import textwrap
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    DeliveryReadinessPolicyReportApiEnvelope,
    DeliveryReadinessPolicyReportView,
)


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def _item(item_id: str) -> dict[str, object]:
    return {
        "itemId": item_id,
        "label": "Delivery readiness rule",
        "status": "required",
        "summary": "The rule is represented as read-only delivery evidence.",
        "evidence": ["story:3-44-delivery-readiness-policy-report"],
    }


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "delivery-readiness-policy-report-v1",
        "generatedAt": datetime(2026, 7, 20, 19, 30, tzinfo=timezone.utc),
        "summary": "Read-only policy for delivery readiness; it does not execute delivery or cleanup.",
        "statusPolicy": [_item("pull-request-status")],
        "waiverPolicy": [_item("local-only-waiver")],
        "promoteReadinessPolicy": [_item("promote-authority")],
        "deliverReadinessPolicy": [_item("deliver-authority")],
        "blockerRoutingPolicy": [_item("blocked-checks")],
        "stopLines": ["Do not treat this report as approval for remote delivery automation."],
        "nextSafeActions": ["Use the work-item delivery readiness checkpoint form."],
        "readOnly": True,
        "executionAuthorityApproved": False,
        "remoteAutomationApproved": False,
    }


def test_delivery_readiness_policy_envelope_is_strict_and_typed() -> None:
    envelope = DeliveryReadinessPolicyReportApiEnvelope.model_validate(
        {"data": _valid_report()}
    )

    assert isinstance(envelope.data, DeliveryReadinessPolicyReportView)
    assert (
        DeliveryReadinessPolicyReportApiEnvelope.model_fields["data"].annotation
        is DeliveryReadinessPolicyReportView
    )

    with pytest.raises(ValidationError):
        DeliveryReadinessPolicyReportApiEnvelope.model_validate(
            {"data": _valid_report(), "unexpected": True}
        )
    with pytest.raises(ValidationError):
        DeliveryReadinessPolicyReportApiEnvelope.model_validate(
            {"data": _valid_report(), "meta": {"nested": {"not": "allowed"}}}
        )
    with pytest.raises(ValidationError):
        invalid_nested = _valid_report()
        invalid_nested["statusPolicy"][0]["unexpected"] = "rejected"  # type: ignore[index]
        DeliveryReadinessPolicyReportApiEnvelope.model_validate({"data": invalid_nested})
    with pytest.raises(ValidationError):
        missing_safety = _valid_report()
        del missing_safety["remoteAutomationApproved"]
        DeliveryReadinessPolicyReportApiEnvelope.model_validate({"data": missing_safety})
    with pytest.raises(ValidationError):
        invalid_safety = _valid_report()
        invalid_safety["executionAuthorityApproved"] = True
        DeliveryReadinessPolicyReportApiEnvelope.model_validate({"data": invalid_safety})
    for field, value in (
        ("readOnly", 1),
        ("executionAuthorityApproved", 0),
        ("remoteAutomationApproved", 0),
    ):
        with pytest.raises(ValidationError):
            invalid_numeric = _valid_report()
            invalid_numeric[field] = value
            DeliveryReadinessPolicyReportApiEnvelope.model_validate({"data": invalid_numeric})


def test_delivery_readiness_policy_route_returns_typed_envelope() -> None:
    route = _route("/supervisor/delivery-readiness-policy-report")

    assert route.response_model is DeliveryReadinessPolicyReportApiEnvelope
    result = asyncio.run(route.endpoint())
    assert isinstance(result, DeliveryReadinessPolicyReportApiEnvelope)
    assert isinstance(result.data, DeliveryReadinessPolicyReportView)
    openapi = app.openapi()
    schema = openapi["components"]["schemas"]["DeliveryReadinessPolicyReportApiEnvelope"]
    assert schema["properties"]["data"]["$ref"].endswith("DeliveryReadinessPolicyReportView")


def test_delivery_readiness_policy_typescript_contract_matches_python() -> None:
    contract = (
        Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts"
    ).read_text()

    assert "export interface DeliveryReadinessPolicyReportApiEnvelope" in contract
    assert "data: DeliveryReadinessPolicyReportView;" in contract
    assert "readOnly: true;" in contract
    assert "executionAuthorityApproved: false;" in contract
    assert "remoteAutomationApproved: false;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_delivery_readiness_policy_getter_is_sync_static_and_non_executing() -> None:
    source_path = Path(__file__).parents[1] / "src" / "supervisor" / "application" / "service.py"
    source = source_path.read_text()
    start = source.index("    def get_delivery_readiness_policy_report(")
    end = source.index("    def get_execution_configuration_checks(", start)
    getter = source[start:end]

    assert "    async def get_delivery_readiness_policy_report(" not in getter
    assert "session" not in getter.splitlines()[0]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "does not mutate delivery readiness metadata" in getter
    assert "not approval for remote delivery automation" in getter

    tree = ast.parse(textwrap.dedent(getter))
    assert len(tree.body) == 1 and isinstance(tree.body[0], ast.FunctionDef)
    allowed_nodes = (
        ast.Attribute,
        ast.Call,
        ast.Constant,
        ast.FunctionDef,
        ast.List,
        ast.Load,
        ast.Module,
        ast.Name,
        ast.Return,
        ast.arg,
        ast.arguments,
        ast.keyword,
    )
    assert all(isinstance(node, allowed_nodes) for node in ast.walk(tree))
    calls = {
        ast.unparse(node.func)
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
    }
    assert calls <= {"datetime.now", "DeliveryReadinessPolicyItemView", "DeliveryReadinessPolicyReportView"}
