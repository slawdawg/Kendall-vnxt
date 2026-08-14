from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    MvpProofTrialReportApiEnvelope,
    MvpProofTrialReportView,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _report() -> dict[str, object]:
    return {
        "reportId": "epic-6-mvp-proof-trial-report-v1",
        "generatedAt": datetime(2026, 7, 21, 5, 30, tzinfo=timezone.utc),
        "summary": "Read-only Epic 6 proof trial.",
        "selectedStory": "Story 3.66",
        "trialStatus": "epic_6_mvp_proof_complete",
        "steps": [
            {
                "stepId": "select-real-story",
                "label": "Select real story",
                "status": "completed",
                "summary": "Story selected.",
                "requiredApproval": "Recorded approval.",
                "evidence": ["story path"],
            }
        ],
        "approvalPackets": ["bounded implementation approval"],
        "blockedOperations": ["provider expansion"],
        "stopConditions": ["scope expansion"],
        "nextSafeActions": ["retain proof evidence"],
        "readOnly": True,
        "codexLaunchApproved": True,
        "claudeLaunchApproved": False,
        "providerExpansionApproved": False,
        "autonomousDeliveryApproved": False,
    }


def test_mvp_proof_trial_envelope_is_strict_and_typed() -> None:
    envelope = MvpProofTrialReportApiEnvelope.model_validate({"data": _report()})
    assert isinstance(envelope.data, MvpProofTrialReportView)
    with pytest.raises(ValidationError):
        MvpProofTrialReportApiEnvelope.model_validate({"data": _report(), "unexpected": True})
    with pytest.raises(ValidationError):
        invalid = _report()
        invalid["claudeLaunchApproved"] = True
        MvpProofTrialReportApiEnvelope.model_validate({"data": invalid})
    with pytest.raises(ValidationError):
        invalid = _report()
        invalid["steps"] = [{**invalid["steps"][0], "unexpected": True}]  # type: ignore[index]
        MvpProofTrialReportApiEnvelope.model_validate({"data": invalid})


def test_mvp_proof_trial_route_uses_typed_envelope() -> None:
    assert _route("/supervisor/epic-6-mvp-proof-trial-report").response_model is MvpProofTrialReportApiEnvelope


def test_mvp_proof_trial_catalog_entry_is_historical() -> None:
    route = _route("/supervisor/report-catalog")
    result = asyncio.run(route.endpoint())

    entry = next(
        report
        for report in result.data.reports
        if report.reportId == "epic-6-mvp-proof-trial-report-v1"
    )
    assert entry.status == "historical"


def test_mvp_proof_trial_typescript_contract_matches_python() -> None:
    contract = (Path(__file__).parents[3] / "packages" / "contracts" / "src" / "api.ts").read_text()
    assert "export interface MvpProofTrialReportApiEnvelope" in contract
    assert "data: MvpProofTrialReportView;" in contract
    assert "codexLaunchApproved: true;" in contract
    assert "claudeLaunchApproved: false;" in contract
    assert "providerExpansionApproved: false;" in contract
    assert "autonomousDeliveryApproved: false;" in contract
