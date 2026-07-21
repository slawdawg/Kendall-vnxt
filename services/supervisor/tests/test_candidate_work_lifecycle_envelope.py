from supervisor.api import main as main_module
from supervisor.api.schemas import CandidateWorkApiEnvelope, CandidateWorkView


def _route(path: str):
    return next(route for route in main_module.app.routes if getattr(route, "path", None) == path)


def test_candidate_work_update_route_uses_typed_envelope() -> None:
    route = _route("/candidate-work/{candidate_work_id}")

    assert route.response_model is CandidateWorkApiEnvelope
    assert CandidateWorkApiEnvelope.model_fields["data"].annotation is CandidateWorkView
    assert CandidateWorkApiEnvelope.model_config["extra"] == "forbid"


def test_candidate_work_import_routes_use_typed_envelope() -> None:
    for path in ("/candidate-work/import-bmad", "/candidate-work/import-obsidian-metadata"):
        assert _route(path).response_model is CandidateWorkApiEnvelope
