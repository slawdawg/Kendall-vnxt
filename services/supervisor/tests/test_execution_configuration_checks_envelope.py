from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import ExecutionConfigurationChecksApiEnvelope, ExecutionConfigurationChecksView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_checks() -> dict[str, object]:
    return {
        "summary": "All execution paths remain disabled.",
        "allDisabled": True,
        "generatedAt": "2026-07-20T13:00:00Z",
        "checks": [
            {
                "checkId": "provider-calls",
                "label": "Provider calls",
                "status": "disabled",
                "enabled": False,
                "affectedWorkers": [],
                "evidence": ["local-only"],
                "launchTargets": [],
            }
        ],
    }


def test_execution_configuration_checks_envelope_is_strict_and_typed() -> None:
    assert ExecutionConfigurationChecksApiEnvelope.model_fields["data"].annotation is ExecutionConfigurationChecksView
    assert ExecutionConfigurationChecksApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        ExecutionConfigurationChecksApiEnvelope.model_validate({"data": _valid_checks(), "unexpected": True})

    with pytest.raises(ValidationError):
        ExecutionConfigurationChecksApiEnvelope.model_validate({"data": _valid_checks(), "meta": {"nested": {"blocked": True}}})


def test_execution_configuration_checks_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/execution-configuration-checks").response_model is ExecutionConfigurationChecksApiEnvelope


def test_shared_typescript_execution_configuration_checks_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface ExecutionConfigurationChecksView" in contract_source
    assert "export interface ExecutionConfigurationChecksApiEnvelope" in contract_source
    assert "data: ExecutionConfigurationChecksView;" in contract_source
    assert "checks: ExecutionConfigurationCheckView[];" in contract_source
