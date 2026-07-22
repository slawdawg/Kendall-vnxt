from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api import main as main_module
from supervisor.api.schemas import (
    CandidateWorkPromotionApiEnvelope,
    CandidateWorkPromotionView,
    DeliveryExecutionEvidenceApiEnvelope,
    DeliveryExecutionEvidenceView,
    WorkItemApiEnvelope,
    WorkItemView,
)


def _route(path: str):
    return next(route for route in main_module.app.routes if getattr(route, "path", None) == path)


def test_epic_32_routes_use_strict_typed_envelopes() -> None:
    assert _route("/work-items/{work_item_id}/prepare-branch").response_model is WorkItemApiEnvelope
    assert _route("/work-items/{work_item_id}/delivery-execution-evidence").response_model is DeliveryExecutionEvidenceApiEnvelope
    assert _route("/candidate-work/{candidate_work_id}/promote").response_model is CandidateWorkPromotionApiEnvelope
    assert DeliveryExecutionEvidenceApiEnvelope.model_fields["data"].annotation is DeliveryExecutionEvidenceView
    assert CandidateWorkPromotionApiEnvelope.model_fields["data"].annotation is CandidateWorkPromotionView
    assert DeliveryExecutionEvidenceApiEnvelope.model_config["extra"] == "forbid"
    assert CandidateWorkPromotionApiEnvelope.model_config["extra"] == "forbid"
    assert DeliveryExecutionEvidenceView.model_config["extra"] == "forbid"
    assert CandidateWorkPromotionView.model_config["extra"] == "forbid"


def test_epic_32_typescript_contracts_match_python_boundaries() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface DeliveryExecutionEvidenceApiEnvelope" in contract_source
    assert "data: DeliveryExecutionEvidenceView;" in contract_source
    assert "export interface CandidateWorkPromotionApiEnvelope" in contract_source
    assert "data: CandidateWorkPromotionView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
    assert "export interface WorkItemApiEnvelope" in contract_source
    assert "data: WorkItemView;" in contract_source


def test_epic_32_envelopes_reject_unknown_and_non_scalar_metadata() -> None:
    evidence = {
        "evidenceId": "evidence-1",
        "mode": "local",
        "actionId": "pr",
        "status": "recorded",
        "eventRecorded": False,
        "summary": "metadata-only evidence",
        "recoveryPath": "retry",
        "unexpected": True,
    }
    with pytest.raises(ValidationError):
        DeliveryExecutionEvidenceView.model_validate(evidence)
    with pytest.raises(ValidationError):
        DeliveryExecutionEvidenceApiEnvelope.model_validate({"data": evidence, "meta": {"nested": []}})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionApiEnvelope.model_validate({"data": {}, "meta": {"nested": []}})


def test_epic_32_promotion_requires_both_result_objects() -> None:
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"candidateWork": {}})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"workItem": {}})
