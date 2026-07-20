from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import LegacyPlanningArtifactInventoryApiEnvelope, LegacyPlanningArtifactInventoryReportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "legacy-inventory-1",
        "generatedAt": "2026-07-20T15:00:00Z",
        "summary": "Legacy planning artifacts remain metadata-only.",
        "candidates": [],
        "nextSafeActions": ["Keep legacy artifacts local and metadata-only."],
    }


def test_legacy_planning_inventory_envelope_is_strict_and_typed() -> None:
    assert LegacyPlanningArtifactInventoryApiEnvelope.model_fields["data"].annotation is LegacyPlanningArtifactInventoryReportView
    assert LegacyPlanningArtifactInventoryApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        LegacyPlanningArtifactInventoryApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        LegacyPlanningArtifactInventoryApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_legacy_planning_inventory_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/legacy-planning-artifact-inventory").response_model is LegacyPlanningArtifactInventoryApiEnvelope


def test_shared_typescript_legacy_inventory_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface LegacyPlanningArtifactInventoryApiEnvelope" in contract_source
    assert "data: LegacyPlanningArtifactInventoryReportView;" in contract_source
    assert "artifactBodyRetained: false;" in contract_source
