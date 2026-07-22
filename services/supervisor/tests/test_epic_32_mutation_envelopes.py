from pathlib import Path

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


def test_epic_32_typescript_contracts_match_python_boundaries() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface DeliveryExecutionEvidenceApiEnvelope" in contract_source
    assert "data: DeliveryExecutionEvidenceView;" in contract_source
    assert "export interface CandidateWorkPromotionApiEnvelope" in contract_source
    assert "data: CandidateWorkPromotionView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
