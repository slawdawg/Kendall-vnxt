from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import DocumentationAuthorityReportApiEnvelope, DocumentationAuthorityReportView


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def _valid_report() -> dict[str, object]:
    document = {"path": "docs/index.md", "label": "Documentation index", "status": "ready", "evidence": []}
    return {
        "reportId": "documentation-authority-1",
        "generatedAt": "2026-07-20T14:30:00Z",
        "summary": "Documentation authority is bounded.",
        "indexes": [document],
        "approvalCheckpoint": document,
        "blockedStories": [],
        "driftChecks": [],
        "nextSafeActions": ["Keep source-owned docs authoritative."],
    }


def test_documentation_authority_report_envelope_is_strict_and_typed() -> None:
    assert DocumentationAuthorityReportApiEnvelope.model_fields["data"].annotation is DocumentationAuthorityReportView
    assert DocumentationAuthorityReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        DocumentationAuthorityReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        DocumentationAuthorityReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_documentation_authority_report_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/documentation-authority-report").response_model is DocumentationAuthorityReportApiEnvelope


def test_shared_typescript_documentation_authority_contract_matches_python_model() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface DocumentationAuthorityReportApiEnvelope" in contract_source
    assert "data: DocumentationAuthorityReportView;" in contract_source
