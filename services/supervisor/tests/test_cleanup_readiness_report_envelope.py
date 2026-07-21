from __future__ import annotations

import asyncio
from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    CleanupPlanApiEnvelope,
    LocalCleanupReadinessReportApiEnvelope,
    RemoteCleanupSyncReadinessReportApiEnvelope,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def test_cleanup_readiness_routes_use_strict_typed_envelopes():
    assert _route("/work-items/{work_item_id}/cleanup-plan").response_model is CleanupPlanApiEnvelope
    assert _route("/supervisor/local-cleanup-readiness-report").response_model is LocalCleanupReadinessReportApiEnvelope
    assert _route("/supervisor/remote-cleanup-sync-readiness-report").response_model is RemoteCleanupSyncReadinessReportApiEnvelope

    for envelope in (
        CleanupPlanApiEnvelope,
        LocalCleanupReadinessReportApiEnvelope,
        RemoteCleanupSyncReadinessReportApiEnvelope,
    ):
        assert envelope.model_config["extra"] == "forbid"
        with pytest.raises(ValidationError):
            envelope.model_validate({"data": {}, "unexpected": True})

    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface CleanupPlanApiEnvelope" in contract_source
    assert "export interface LocalCleanupReadinessReportApiEnvelope" in contract_source
    assert "export interface RemoteCleanupSyncReadinessReportApiEnvelope" in contract_source


def test_cleanup_readiness_reports_preserve_report_only_safety_literals():
    local = asyncio.run(_route("/supervisor/local-cleanup-readiness-report").endpoint())
    remote = asyncio.run(_route("/supervisor/remote-cleanup-sync-readiness-report").endpoint())

    assert local.data.readOnly is True
    assert local.data.automaticCleanupApproved is False
    assert remote.data.readOnly is True
    assert remote.data.remoteMutationApproved is False

    invalid_local = local.data.model_dump()
    invalid_local["automaticCleanupApproved"] = True
    with pytest.raises(ValidationError):
        LocalCleanupReadinessReportApiEnvelope.model_validate({"data": invalid_local})

    invalid_remote = remote.data.model_dump()
    invalid_remote["remoteMutationApproved"] = True
    with pytest.raises(ValidationError):
        RemoteCleanupSyncReadinessReportApiEnvelope.model_validate({"data": invalid_remote})


def test_cleanup_readiness_envelopes_reject_unknown_nested_fields():
    local = asyncio.run(_route("/supervisor/local-cleanup-readiness-report").endpoint())
    invalid_local = local.data.model_dump()
    invalid_local["cleanupPolicy"] = [{**invalid_local["cleanupPolicy"][0], "unexpected": True}]
    with pytest.raises(ValidationError):
        LocalCleanupReadinessReportApiEnvelope.model_validate({"data": invalid_local})

    remote = asyncio.run(_route("/supervisor/remote-cleanup-sync-readiness-report").endpoint())
    invalid_remote = remote.data.model_dump()
    invalid_remote["syncPolicy"] = [{**invalid_remote["syncPolicy"][0], "unexpected": True}]
    with pytest.raises(ValidationError):
        RemoteCleanupSyncReadinessReportApiEnvelope.model_validate({"data": invalid_remote})
