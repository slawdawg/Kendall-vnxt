from __future__ import annotations

import ast
import asyncio
import textwrap
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    GitHubDeliveryAuthorityReportApiEnvelope,
    GitHubDeliveryAuthorityReportView,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def test_github_delivery_authority_envelope_is_strict_and_typed() -> None:
    route = _route("/supervisor/github-delivery-authority-report")
    envelope = asyncio.run(route.endpoint())
    assert isinstance(envelope, GitHubDeliveryAuthorityReportApiEnvelope)
    assert isinstance(envelope.data, GitHubDeliveryAuthorityReportView)

    with pytest.raises(ValidationError):
        GitHubDeliveryAuthorityReportApiEnvelope.model_validate(
            {"data": envelope.data.model_dump(), "unexpected": True}
        )
    for field, value in (("readOnly", 1), ("pushApproved", 0), ("pullRequestApproved", 0), ("ciWaitApproved", 0), ("reviewResolutionApproved", 0), ("mergeApproved", 0), ("remoteCleanupApproved", 0), ("automaticDeliveryApproved", 0)):
        with pytest.raises(ValidationError):
            invalid = envelope.data.model_dump()
            invalid[field] = value
            GitHubDeliveryAuthorityReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["automaticDeliveryApproved"] = True
        GitHubDeliveryAuthorityReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["ladder"][0]["unexpected"] = "rejected"
        GitHubDeliveryAuthorityReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = envelope.data.model_dump()
        invalid["eligibilityStages"][0]["unexpected"] = "rejected"
        GitHubDeliveryAuthorityReportApiEnvelope.model_validate({"data": invalid})


def test_github_delivery_authority_route_and_openapi_use_typed_envelope() -> None:
    route = _route("/supervisor/github-delivery-authority-report")
    assert route.response_model is GitHubDeliveryAuthorityReportApiEnvelope
    schema = app.openapi()["components"]["schemas"]["GitHubDeliveryAuthorityReportApiEnvelope"]
    assert schema["properties"]["data"]["$ref"].endswith("GitHubDeliveryAuthorityReportView")


def test_github_delivery_authority_typescript_contract_matches_python() -> None:
    contract = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text()
    assert "export interface GitHubDeliveryAuthorityReportApiEnvelope" in contract
    assert "data: GitHubDeliveryAuthorityReportView;" in contract
    assert "readOnly: true;" in contract
    assert "automaticDeliveryApproved: false;" in contract
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract


def test_github_delivery_authority_getter_is_static_and_non_executing() -> None:
    source = (Path(__file__).parents[1] / "src/supervisor/application/service.py").read_text()
    start = source.index("    def get_github_delivery_authority_report(")
    end = source.index("    async def get_trusted_delivery_eligibility_report(", start)
    getter = source[start:end]
    assert "subprocess" not in getter
    assert "httpx" not in getter.lower()
    assert "session" not in getter.splitlines()[0]
    tree = ast.parse(textwrap.dedent(getter))
    allowed = (ast.Attribute, ast.Call, ast.Constant, ast.FunctionDef, ast.List, ast.Load, ast.Module, ast.Name, ast.Return, ast.arg, ast.arguments, ast.keyword)
    assert len(tree.body) == 1 and isinstance(tree.body[0], ast.FunctionDef)
    assert all(isinstance(node, allowed) for node in ast.walk(tree))
    calls = {ast.unparse(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)}
    assert calls <= {"datetime.now", "GitHubDeliveryAuthorityStepView", "GitHubDeliveryEligibilityStageView", "GitHubDeliveryAuthorityReportView"}
