from __future__ import annotations

from pathlib import Path

from supervisor.api.main import app
from supervisor.api.schemas import (
    CleanupPlanApiEnvelope,
    DeliveryReadinessPolicyReportApiEnvelope,
    GitHubDeliveryAuthorityReportApiEnvelope,
    LocalCleanupReadinessReportApiEnvelope,
    LowRiskDeliveryPlanReportApiEnvelope,
    RemoteCleanupSyncReadinessReportApiEnvelope,
    TrustedAutonomyReadinessReportApiEnvelope,
    TrustedDeliveryEligibilityReportApiEnvelope,
)


def _route(path: str, method: str = "GET"):
    return next(
        route
        for route in app.routes
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set())
    )


def test_delivery_and_cleanup_read_routes_use_typed_envelopes() -> None:
    expected = {
        "/supervisor/github-delivery-authority-report": GitHubDeliveryAuthorityReportApiEnvelope,
        "/supervisor/trusted-delivery-eligibility-report": TrustedDeliveryEligibilityReportApiEnvelope,
        "/supervisor/low-risk-delivery-plan": LowRiskDeliveryPlanReportApiEnvelope,
        "/work-items/{work_item_id}/cleanup-plan": CleanupPlanApiEnvelope,
        "/supervisor/local-cleanup-readiness-report": LocalCleanupReadinessReportApiEnvelope,
        "/supervisor/remote-cleanup-sync-readiness-report": RemoteCleanupSyncReadinessReportApiEnvelope,
        "/supervisor/trusted-autonomy-readiness-report": TrustedAutonomyReadinessReportApiEnvelope,
        "/supervisor/delivery-readiness-policy-report": DeliveryReadinessPolicyReportApiEnvelope,
    }
    for path, envelope in expected.items():
        assert _route(path).response_model is envelope


def test_delivery_and_cleanup_contracts_remain_metadata_only_and_strict() -> None:
    for envelope in (
        GitHubDeliveryAuthorityReportApiEnvelope,
        TrustedDeliveryEligibilityReportApiEnvelope,
        LowRiskDeliveryPlanReportApiEnvelope,
        CleanupPlanApiEnvelope,
        LocalCleanupReadinessReportApiEnvelope,
        RemoteCleanupSyncReadinessReportApiEnvelope,
        TrustedAutonomyReadinessReportApiEnvelope,
        DeliveryReadinessPolicyReportApiEnvelope,
    ):
        assert envelope.model_config["extra"] == "forbid"
        assert envelope.model_fields["data"].annotation is not object


def test_shared_typescript_delivery_cleanup_contracts_are_present() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    for name in (
        "GitHubDeliveryAuthorityReportApiEnvelope",
        "TrustedDeliveryEligibilityReportApiEnvelope",
        "LowRiskDeliveryPlanReportApiEnvelope",
        "CleanupPlanApiEnvelope",
        "LocalCleanupReadinessReportApiEnvelope",
        "RemoteCleanupSyncReadinessReportApiEnvelope",
        "TrustedAutonomyReadinessReportApiEnvelope",
        "DeliveryReadinessPolicyReportApiEnvelope",
    ):
        assert f"export interface {name}" in contract_source
