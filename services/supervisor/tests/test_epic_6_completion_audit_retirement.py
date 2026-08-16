from __future__ import annotations

import asyncio

from fastapi.routing import APIRoute

from supervisor.api.main import app
from supervisor.application.service import SupervisorService


RETIRED_PATH = "/supervisor/epic-6-completion-audit-report"
RETIRED_REPORT_ID = "epic-6-completion-audit-report-v1"


def _route(path: str) -> APIRoute:
    return next(
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path == path
    )


def test_epic_6_completion_audit_route_schema_and_service_are_retired() -> None:
    route_paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
    }

    assert RETIRED_PATH not in route_paths
    assert not hasattr(SupervisorService, "get_epic_6_completion_audit_report")


def test_epic_6_completion_audit_is_omitted_from_catalog_while_mvp_trial_remains() -> None:
    catalog = asyncio.run(_route("/supervisor/report-catalog").endpoint()).data
    catalog_ids = {report.reportId for report in catalog.reports}
    catalog_endpoints = {report.endpoint for report in catalog.reports}

    assert RETIRED_REPORT_ID not in catalog_ids
    assert f"GET {RETIRED_PATH}" not in catalog_endpoints
    assert "epic-6-mvp-proof-trial-report-v1" in catalog_ids
    assert "GET /supervisor/epic-6-mvp-proof-trial-report" in catalog_endpoints


def test_epic_6_mvp_proof_trial_runtime_contract_is_unchanged() -> None:
    report = asyncio.run(
        _route("/supervisor/epic-6-mvp-proof-trial-report").endpoint()
    ).data

    assert report.reportId == "epic-6-mvp-proof-trial-report-v1"
    assert report.readOnly is True
    assert report.codexLaunchApproved is True
    assert report.claudeLaunchApproved is False
    assert report.providerExpansionApproved is False
    assert report.autonomousDeliveryApproved is False

    done_evidence = next(
        step for step in report.steps if step.stepId == "done-evidence"
    )
    assert "retained MVP proof report" in done_evidence.summary
    assert "historical completion audit" in done_evidence.summary
    assert "completion audit retain" not in done_evidence.summary
