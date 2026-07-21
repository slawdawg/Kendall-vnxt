from pathlib import Path

from supervisor.api import main as main_module
from supervisor.api.schemas import CandidateWorkApiEnvelope, CandidateWorkView


def _route(path: str):
    return next(route for route in main_module.app.routes if getattr(route, "path", None) == path)


def test_candidate_work_create_route_uses_typed_envelope() -> None:
    route = _route("/candidate-work")

    assert route.response_model is CandidateWorkApiEnvelope
    assert CandidateWorkApiEnvelope.model_fields["data"].annotation is CandidateWorkView
    assert CandidateWorkApiEnvelope.model_config["extra"] == "forbid"


def test_candidate_work_create_route_reuses_shared_typescript_contract() -> None:
    contract_source = (Path(__file__).parents[3] / "packages/contracts/src/api.ts").read_text(encoding="utf-8")

    assert "export interface CandidateWorkApiEnvelope" in contract_source
    assert "data: CandidateWorkView;" in contract_source
    assert "meta?: Record<string, string | number | boolean | null> | null;" in contract_source
