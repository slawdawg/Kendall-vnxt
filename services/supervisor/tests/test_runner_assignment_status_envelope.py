from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import RunnerAssignmentStatusReportApiEnvelope, RunnerAssignmentStatusReportView


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportStatus": "ready",
        "generatedAt": "2026-07-20T17:15:00Z",
        "stateRootStatus": "ready",
        "partial": False,
        "staleAfterSeconds": 86400,
        "summary": {},
        "dispatcherContinuity": {
            "snapshotId": "runner-snapshot-1",
            "dryRunCommand": "node dispatch-next --dry-run",
            "summaryDryRunCommand": "node dispatch-next --summary-json",
            "assignableCount": 0,
            "activeCount": 0,
            "blockedCount": 0,
            "ambiguousCount": 0,
            "closedCount": 0,
            "nextAction": "Continue bounded assignment inspection.",
        },
    }


def test_runner_assignment_status_envelope_is_strict_and_typed():
    assert RunnerAssignmentStatusReportApiEnvelope.model_fields["data"].annotation is RunnerAssignmentStatusReportView
    assert RunnerAssignmentStatusReportApiEnvelope.model_config["extra"] == "forbid"

    with pytest.raises(ValidationError):
        RunnerAssignmentStatusReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    with pytest.raises(ValidationError):
        RunnerAssignmentStatusReportApiEnvelope.model_validate({"data": _valid_report(), "meta": {"nested": {"blocked": True}}})


def test_runner_assignment_status_route_uses_typed_envelope():
    assert _route("/supervisor/runner-assignment-status-report").response_model is RunnerAssignmentStatusReportApiEnvelope


def test_shared_typescript_runner_assignment_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface RunnerAssignmentStatusReportApiEnvelope" in contract_source
    assert "data: RunnerAssignmentStatusReportView;" in contract_source
