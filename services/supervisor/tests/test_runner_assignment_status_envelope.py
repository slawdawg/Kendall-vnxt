from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    RunnerAssignmentStatusReportApiEnvelope,
    RunnerAssignmentStatusReportView,
    RunnerAssignmentStatusRowView,
    RunnerSourceCompletionEvidenceView,
)
from supervisor.application.service import SupervisorService


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


def test_runner_assignment_status_envelope_exposes_typed_closed_history_projection():
    report = RunnerAssignmentStatusReportView.model_validate(
        {
            **_valid_report(),
            "closedHistory": {
                "workspaceRows": 500,
                "laneRows": 252,
                "totalRows": 752,
                "omittedRows": 752,
                "degradedRows": 3,
                "warningCounts": {"missing-heartbeat": 3},
            },
        }
    )

    assert report.closedHistory.workspaceRows == 500
    assert report.closedHistory.laneRows == 252
    assert report.closedHistory.totalRows == 752
    assert report.closedHistory.omittedRows == 752
    assert report.closedHistory.degradedRows == 3
    assert report.closedHistory.warningCounts == {"missing-heartbeat": 3}
    assert report.closedHistory.unlistedWarningCount == 0


def test_runner_assignment_status_rollup_bounds_verbose_source_ids_without_losing_exact_counts():
    rows = [
        RunnerAssignmentStatusRowView(
            id=f"closed-{index}",
            title=f"Closed {index}",
            classification="closed",
            reasonCode="closed",
            reason="Closed source completion evidence.",
            nextSafeAction="No assignment action",
            staleAfterSeconds=86400,
            sourceCompletionEvidence=RunnerSourceCompletionEvidenceView(
                evidenceKind="assignment" if index % 2 == 0 else "workspace",
                recordId=f"record-{index}",
                sourceBacklogItemId=f"source-{index}-" + ("x" * 8_000),
                evidenceSummary="Closed source completion evidence.",
            ),
        )
        for index in range(300)
    ]

    rollup = SupervisorService._runner_source_completion_rollup(None, rows)
    report = RunnerAssignmentStatusReportView.model_validate({**_valid_report(), "sourceCompletionRollup": rollup.model_dump()})
    envelope = RunnerAssignmentStatusReportApiEnvelope(data=report)

    assert rollup.total == 300
    assert rollup.assignment == 150
    assert rollup.workspace == 150
    assert rollup.sourceBacklogItemIds == []
    assert rollup.sourceBacklogItemIdsTotal == 300
    assert rollup.sourceBacklogItemIdsRetained == 0
    assert rollup.sourceBacklogItemIdsOmitted == 300
    assert rollup.sourceBacklogItemIdsStatus == "truncated"
    assert len(json.dumps(envelope.model_dump(mode="json")).encode("utf-8")) < 1024 * 1024


def test_runner_assignment_status_rollup_omits_malformed_unicode_source_id():
    rows = [
        RunnerAssignmentStatusRowView(
            id="closed-malformed-source-id",
            title="Closed malformed source ID",
            classification="closed",
            reasonCode="closed",
            reason="Closed source completion evidence.",
            nextSafeAction="No assignment action",
            staleAfterSeconds=86400,
            sourceCompletionEvidence=RunnerSourceCompletionEvidenceView(
                evidenceKind="assignment",
                recordId="record-malformed-source-id",
                sourceBacklogItemId="source-\ud800",
                evidenceSummary="Closed source completion evidence.",
            ),
        )
    ]

    rollup = SupervisorService._runner_source_completion_rollup(None, rows)

    assert rollup.total == 1
    assert rollup.assignment == 1
    assert rollup.sourceBacklogItemIds == []
    assert rollup.sourceBacklogItemIdsTotal == 1
    assert rollup.sourceBacklogItemIdsRetained == 0
    assert rollup.sourceBacklogItemIdsOmitted == 1
    assert rollup.sourceBacklogItemIdsStatus == "truncated"


def test_runner_assignment_status_route_uses_typed_envelope():
    assert _route("/supervisor/runner-assignment-status-report").response_model is RunnerAssignmentStatusReportApiEnvelope


def test_shared_typescript_runner_assignment_contract_matches_python_model():
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface RunnerAssignmentStatusReportApiEnvelope" in contract_source
    assert "data: RunnerAssignmentStatusReportView;" in contract_source
    assert "export interface RunnerClosedHistoryProjectionView" in contract_source
    assert "closedHistory: RunnerClosedHistoryProjectionView;" in contract_source
    assert "warningCounts: Record<string, number>;" in contract_source
    assert "sourceBacklogItemIdsOmitted: number;" in contract_source
    assert 'sourceBacklogItemIdsStatus: "complete" | "truncated";' in contract_source
