from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import RuntimeEvidenceReviewReportApiEnvelope, RuntimeEvidenceReviewReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "runtime-evidence-review-report-v1",
        "generatedAt": "2026-07-20T18:05:00Z",
        "summary": "Runtime evidence review remains read-only and bounded.",
        "workItems": [],
        "reviewQueue": [],
        "crossChecks": [],
        "relatedReports": ["GET /supervisor/runtime-evidence-review-report"],
        "relatedDocs": ["docs/workflows/implementation-evidence-boundary.md"],
        "dashboardAnchors": ["/controls#runtime-evidence-review-report"],
        "stopLines": ["Do not treat review output as execution authority."],
        "nextSafeActions": ["Continue with read-only evidence inspection."],
        "readOnly": True,
        "executionAuthorityApproved": False,
    }


def test_runtime_evidence_review_envelope_is_strict_and_typed():
    assert RuntimeEvidenceReviewReportApiEnvelope.model_fields["data"].annotation is RuntimeEvidenceReviewReportView
    assert RuntimeEvidenceReviewReportApiEnvelope.model_config["extra"] == "forbid"

    envelope = RuntimeEvidenceReviewReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"partial": False, "source": "supervisor"}})
    assert envelope.data.reportId == "runtime-evidence-review-report-v1"

    with pytest.raises(ValidationError):
        RuntimeEvidenceReviewReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        RuntimeEvidenceReviewReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_runtime_evidence_review_route_uses_typed_envelope():
    assert _route("/supervisor/runtime-evidence-review-report").response_model is RuntimeEvidenceReviewReportApiEnvelope


def test_shared_typescript_runtime_evidence_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface RuntimeEvidenceReviewReportApiEnvelope" in contract_source
    assert "data: RuntimeEvidenceReviewReportView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
