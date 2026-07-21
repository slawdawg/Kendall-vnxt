from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError

from supervisor.api.main import app
from supervisor.api.schemas import (
    LowRiskDeliveryPlanReportApiEnvelope,
    LowRiskDeliveryPlanReportView,
)


def _route(path: str) -> APIRoute:
    return next(route for route in app.routes if isinstance(route, APIRoute) and route.path == path)


def _valid_report() -> dict[str, object]:
    return {
        "reportId": "low-risk-delivery-plan-report-v1",
        "generatedAt": "2026-07-21T03:30:00.000Z",
        "summary": "Report-only delivery planning; no merge or cleanup mutation.",
        "workItemId": None,
        "currentBranch": "codex/example",
        "baseBranch": "dev",
        "headRevision": "a" * 40,
        "workingTreeStatus": "clean",
        "prRef": None,
        "actions": [{
            "actionId": "merge",
            "label": "Merge",
            "status": "blocked",
            "eligible": False,
            "dryRunEffects": ["none"],
            "evidence": ["evidence:delivery-plan"],
            "blockedReasons": ["operator_approval_required"],
            "nextSafeAction": "Review the metadata-only plan.",
            "requiredApproval": "operator",
            "requiredPolicy": "low-risk-delivery",
            "allowedOperations": [],
            "blockedOperations": ["merge"],
            "readOnly": True,
        }],
        "mergeGate": {
            "status": "blocked",
            "lowRiskReady": False,
            "criteria": [],
            "blockedReasons": ["operator_approval_required"],
            "recoveryPath": "Obtain approval before any delivery mutation.",
            "metadataOnly": True,
            "mergeApproved": False,
        },
        "cleanupDryRunGate": {
            "status": "blocked",
            "dryRunMatchesPolicy": False,
            "blockedReasons": ["merge_not_complete"],
            "recoveryPath": "Re-run the dry-run after merge evidence.",
            "metadataOnly": True,
            "cleanupApproved": False,
        },
        "hardStops": ["no_automatic_delivery"],
        "nextSafeActions": ["Review evidence"],
        "readOnly": True,
        "remoteMutationApproved": False,
        "cleanupApproved": False,
        "automaticDeliveryApproved": False,
    }


def test_low_risk_delivery_plan_envelope_is_strict_and_typed() -> None:
    assert LowRiskDeliveryPlanReportApiEnvelope.model_fields["data"].annotation is LowRiskDeliveryPlanReportView
    assert LowRiskDeliveryPlanReportApiEnvelope.model_config["extra"] == "forbid"
    envelope = LowRiskDeliveryPlanReportApiEnvelope.model_validate({"data": _valid_report()})
    assert envelope.data.readOnly is True
    assert envelope.data.automaticDeliveryApproved is False

    with pytest.raises(ValidationError):
        LowRiskDeliveryPlanReportApiEnvelope.model_validate({"data": _valid_report(), "unexpected": True})

    invalid = _valid_report()
    invalid["automaticDeliveryApproved"] = True
    with pytest.raises(ValidationError):
        LowRiskDeliveryPlanReportApiEnvelope.model_validate({"data": invalid})


def test_low_risk_delivery_plan_routes_use_declared_report_envelope() -> None:
    assert _route("/supervisor/low-risk-delivery-plan").response_model is LowRiskDeliveryPlanReportApiEnvelope
    assert _route("/work-items/{work_item_id}/low-risk-delivery-plan").response_model is LowRiskDeliveryPlanReportApiEnvelope


def test_shared_typescript_contract_declares_report_envelope() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")
    assert "export interface LowRiskDeliveryPlanReportApiEnvelope" in contract_source
