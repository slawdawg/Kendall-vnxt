from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import RuntimeEvidenceExportApiEnvelope, RuntimeEvidenceExportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_runtime_evidence_export_envelope_has_typed_data_and_forbids_extra_keys() -> None:
    assert RuntimeEvidenceExportApiEnvelope.model_fields["data"].annotation is RuntimeEvidenceExportView
    assert RuntimeEvidenceExportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        RuntimeEvidenceExportApiEnvelope.model_validate({"data": {}, "unexpected": True})


def test_runtime_evidence_export_route_uses_typed_envelope() -> None:
    assert _route("/work-items/{work_item_id}/runtime-evidence-export").response_model is RuntimeEvidenceExportApiEnvelope


def test_shared_typescript_runtime_evidence_export_contract_matches_python_model() -> None:
    contract_source = (
        Path(__file__).parents[3] / "packages/contracts/src/api.ts"
    ).read_text(encoding="utf-8")

    assert "export interface RuntimeEvidenceExportApiEnvelope" in contract_source
    assert "data: RuntimeEvidenceExportView;" in contract_source
