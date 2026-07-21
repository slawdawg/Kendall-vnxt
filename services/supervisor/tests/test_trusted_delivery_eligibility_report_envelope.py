from __future__ import annotations

import asyncio
import ast
import textwrap
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    TrustedDeliveryEligibilityReportApiEnvelope,
    TrustedDeliveryEligibilityReportView,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def test_trusted_delivery_eligibility_envelope_is_strict_and_typed() -> None:
    route = _route("/supervisor/trusted-delivery-eligibility-report")
    envelope = asyncio.run(route.endpoint())
    assert isinstance(envelope, TrustedDeliveryEligibilityReportApiEnvelope)
    assert isinstance(envelope.data, TrustedDeliveryEligibilityReportView)

    with pytest.raises(ValidationError):
        TrustedDeliveryEligibilityReportApiEnvelope.model_validate(
            {"data": envelope.data.model_dump(), "unexpected": True}
        )
    for field, value in (("readOnly", 1), ("automaticDeliveryApproved", 0)):
        with pytest.raises(ValidationError):
            invalid = envelope.data.model_dump()
            invalid[field] = value
            TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": invalid})
    for field in ("pushPrAutoEligible", "mergeAutoEligible", "cleanupAutoEligible"):
        invalid = envelope.data.model_dump()
        invalid[field] = 1
        with pytest.raises(ValidationError):
            TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": invalid})
        eligible = envelope.data.model_dump()
        eligible[field] = True
        TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": eligible})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["automaticDeliveryApproved"] = True
        TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["diffGuard"]["unexpected"] = "rejected"
        TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["stages"][0]["unexpected"] = "rejected"
        TrustedDeliveryEligibilityReportApiEnvelope.model_validate({"data": invalid})


def test_trusted_delivery_eligibility_route_and_openapi_use_typed_envelope() -> None:
    route = _route("/supervisor/trusted-delivery-eligibility-report")
    assert route.response_model is TrustedDeliveryEligibilityReportApiEnvelope
    schema = app.openapi()["components"]["schemas"]["TrustedDeliveryEligibilityReportApiEnvelope"]
    assert schema["properties"]["data"]["$ref"].endswith("TrustedDeliveryEligibilityReportView")


def test_trusted_delivery_eligibility_typescript_contract_matches_python() -> None:
    contract = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text()
    assert "export interface TrustedDeliveryEligibilityReportApiEnvelope" in contract
    assert "data: TrustedDeliveryEligibilityReportView;" in contract
    assert "readOnly: true;" in contract
    assert "automaticDeliveryApproved: false;" in contract
    assert "pushPrAutoEligible: boolean;" in contract
    assert "mergeAutoEligible: boolean;" in contract
    assert "cleanupAutoEligible: boolean;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_trusted_delivery_eligibility_getter_is_read_only_and_provider_free() -> None:
    source = (Path(__file__).parents[1] / "src/supervisor/application/service.py").read_text()
    start = source.index("    async def get_trusted_delivery_eligibility_report(")
    end = source.index("    async def get_low_risk_delivery_plan_report(", start)
    getter = source[start:end].lower()
    assert "_git_output" in getter
    for forbidden in ("subprocess", "httpx", "gh pr", "gh api", "git push", "git merge", "git clean", "git reset", "git checkout"):
        assert forbidden not in getter
    tree = ast.parse(textwrap.dedent(source[start:end]))
    calls = {ast.unparse(node.func).lower() for node in ast.walk(tree) if isinstance(node, ast.Call)}
    allowed_calls = {
        "TrustedDeliveryEligibilityCheckView",
        "TrustedDeliveryEligibilityReportView",
        "ahead_output.isdigit",
        "all",
        "bool",
        "current_branch.startswith",
        "datetime.now",
        "delivery_evidence.get",
        "int",
        "isinstance",
        "launch_evidence.get",
        "launch_scope.get",
        "self._eligibility_check",
        "self._git_output",
        "self._latest_work_item_artifact_evidence",
        "self._latest_work_item_verification_evidence",
        "self._trusted_delivery_action_eligibility",
        "self._trusted_delivery_action_eligibility_fixtures",
        "self._trusted_delivery_diff_guard",
        "self._trusted_delivery_diff_guard_fixtures",
        "self._trusted_delivery_stage",
        "self._trusted_delivery_verification_evidence_fixtures",
        "self._work_item_delivery_evidence",
        "status_output.strip",
        "str",
        "verification_blocked_reason_by_status.get",
        "verification_evidence.get",
    }
    assert calls <= {call.lower() for call in allowed_calls}
    git_calls = {
        ast.unparse(node.args[0])
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and ast.unparse(node.func).lower() == "self._git_output"
        and node.args
    }
    assert git_calls == {
        "['git', 'branch', '--show-current']",
        "['git', 'rev-parse', '--short', 'HEAD']",
        "['git', 'status', '--porcelain=v1']",
        "['git', 'rev-parse', '--verify', base_branch]",
        "['git', 'rev-list', '--count', f'{base_branch}..HEAD']",
        "['git', 'diff', '--stat', f'{base_branch}...HEAD']",
        "['git', 'diff', '--name-status', f'{base_branch}...HEAD']",
    }
    allowed_nodes = {
        "And", "Assign", "AsyncFunctionDef", "Attribute", "Await", "BinOp", "BitOr", "BoolOp", "Call",
        "Compare", "Constant", "Dict", "DictComp", "Eq", "FormattedValue", "GeneratorExp", "Gt", "IfExp",
        "In", "JoinedStr", "List", "ListComp", "Load", "Module", "Name", "Not", "NotEq", "NotIn", "Or",
        "Return", "Set", "Store", "Subscript", "Tuple", "UnaryOp", "arg", "arguments", "comprehension", "keyword",
    }
    assert {type(node).__name__ for node in ast.walk(tree)} <= allowed_nodes
