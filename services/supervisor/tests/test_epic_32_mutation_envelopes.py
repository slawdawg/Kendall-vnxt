from pathlib import Path

import pytest
from pydantic import ValidationError

from supervisor.api import main as main_module
from supervisor.api.schemas import (
    CandidateWorkPromotionApiEnvelope,
    CandidateWorkPromotionView,
    CandidateWorkView,
    DeliveryExecutionEvidenceApiEnvelope,
    DeliveryExecutionEvidenceView,
    WorkItemApiEnvelope,
    WorkItemView,
    _strict_contract_payload,
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
        WorkItemApiEnvelope.model_validate({"data": {}, "meta": {"nested": []}})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionApiEnvelope.model_validate({"data": {}, "meta": {"nested": []}})
    with pytest.raises(ValidationError):
        DeliveryExecutionEvidenceApiEnvelope.model_validate({"data": evidence, "unexpected": True})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"candidateWork": {"unexpected": True}, "workItem": {}})
    with pytest.raises(ValidationError):
        DeliveryExecutionEvidenceView.model_validate({**evidence, "exitCode": "1"})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"candidateWork": {"sortOrder": "1"}, "workItem": {}})
    with pytest.raises(ValidationError):
        WorkItemApiEnvelope.model_validate({"data": {"ageMinutes": "1"}})
    with pytest.raises(ValidationError):
        WorkItemApiEnvelope.model_validate({"data": {"ageMinutes": True}})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"candidateWork": {"sortOrder": True}, "workItem": {}})
    with pytest.raises(ValidationError):
        CandidateWorkView.model_validate({"sortOrder": "1"})
    with pytest.raises(ValidationError):
        WorkItemView.model_validate({"ageMinutes": "1"})
    with pytest.raises(ValidationError):
        WorkItemApiEnvelope.model_validate({"data": {"executionRecipe": {"unexpected": True}}})
    with pytest.raises(ValueError):
        _strict_contract_payload(
            {"executionRecipe": {"allowedPaths": [1]}},
            WorkItemView,
            path="prepare.data",
        )
    with pytest.raises(ValueError):
        _strict_contract_payload(
            {"executionRecipe": {"remoteAutomationPolicy": {"unexpected": True}}},
            WorkItemView,
            path="prepare.data",
        )

def test_epic_32_envelopes_accept_null_and_scalar_metadata() -> None:
    evidence = {
        "evidenceId": "evidence-1",
        "mode": "local",
        "actionId": "pr",
        "status": "recorded",
        "eventRecorded": False,
        "summary": "metadata-only evidence",
        "recoveryPath": "retry",
    }
    envelope = DeliveryExecutionEvidenceApiEnvelope.model_validate(
        {"data": evidence, "meta": {"text": "ok", "count": 1, "enabled": True, "nullable": None}}
    )
    assert envelope.meta is not None
    assert envelope.meta["nullable"] is None
    assert DeliveryExecutionEvidenceApiEnvelope.model_validate({"data": evidence, "meta": None}).meta is None


def test_epic_32_recursive_validation_preserves_generic_metadata_and_lists() -> None:
    _strict_contract_payload(
        {"metadata": {}, "executionRecipe": None, "deliveryReadiness": None},
        WorkItemView,
        path="prepare.data",
    )
    _strict_contract_payload({"importMetadata": {}, "sourceSummary": None}, CandidateWorkView, path="promotion.candidateWork")


def test_epic_32_promotion_requires_both_result_objects() -> None:
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"candidateWork": {}})
    with pytest.raises(ValidationError):
        CandidateWorkPromotionView.model_validate({"workItem": {}})
